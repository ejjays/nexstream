import './instrument.js';
import 'dotenv/config';
import dns from 'node:dns';
import { startCipherRotation } from './utils/network/cipher.util.js';

startCipherRotation();
import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import * as Sentry from '@sentry/node'; // skipcq: JS-C1003
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { traceContext } from './utils/infra/trace.util.js';
import { randomUUID } from 'node:crypto';
import db from './utils/infra/db.util.js';
import videoRoutes from './routes/video.routes.js';
import keyChangerRoutes from './routes/keychanger.routes.js';
import remixRoutes from './routes/remix.routes.js';
import { requireApiKey } from './utils/network/auth.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fsPromises = fs.promises;
const STEMS_BASE_DIR = path.join(__dirname, '../temp/remix_stems');

// termux bypass
if (process.platform === 'android') {
  try {
    const { Module } = await import('module');
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function (
      this: unknown,
      name: string,
      ...args: unknown[]
    ) {
      if (name === '@ffmpeg-installer/ffmpeg') {
        return {
          path: 'ffmpeg',
          version: 'system',
          url: 'https://ffmpeg.org/',
        };
      }
      if (name.includes('libsql')) {
        try {
          return (
            originalRequire as (...innerArgs: unknown[]) => unknown
          ).apply(this, [name, ...args]);
        } catch (_ERROR) {
          console.debug('[System] LibSQL bypass error:', _ERROR);
          console.warn(
            `[System] LibSQL native library '${name}' not found, bypassing...`
          );
          return {
            createClient: () => ({
              execute: () => Promise.resolve({ rows: [] }),
              batch: () => Promise.resolve([]),
              close: () => {},
            }),
          };
        }
      }
      if (name === 'msgpackr-extract' || name === 'cpu-features') {
        return null;
      }
      return (originalRequire as (...innerArgs: unknown[]) => unknown).apply(
        this,
        [name, ...args]
      );
    };
    console.log('[System] Mocked native modules for Termux compatibility');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[System] Failed to mock @ffmpeg-installer/ffmpeg: ${message}`
    );
  }
}

const dnsModule = dns as unknown as {
  setDefaultResultOrder?: (order: 'ipv4first' | 'ipv6first') => void;
};
if (dnsModule.setDefaultResultOrder) {
  dnsModule.setDefaultResultOrder('ipv4first');
}

// global errors
process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(`[Unhandled] reason: ${message}`);
});
process.on('uncaughtException', (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[Uncaught] error: ${message}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
});

const app = express();
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT) || 5000;

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https:', 'wss:'],
      },
    },
  })
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/', globalLimiter);

const infoLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Extraction rate limit exceeded. Slow down!' },
});

app.use(['/info', '/stream-urls'], infoLimiter);

// disable SSE compression
app.use(
  compression({
    filter: (req, res) => {
      if (req.path === '/events') return false;
      if (res.getHeader('Content-Type') === 'text/event-stream') return false;
      return compression.filter(req, res);
    },
  })
);

app.use((req: Request, res: Response, next: NextFunction) => {
  const traceId =
    (req.headers['x-correlation-id'] as string) ||
    (req.query.id as string) ||
    randomUUID().split('-')[0];

  res.setHeader('X-Trace-Id', traceId);

  Sentry.withIsolationScope((scope) => {
    if (process.env.SENTRY_DSN) {
      scope.setTag('traceId', traceId);
    }

    traceContext.run({ traceId }, () => {
      next();
    });
  });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/ping' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const traceId =
    (traceContext.getStore() as { traceId?: string })?.traceId || 'global';
  console.log(
    `[${timestamp}] [${traceId}] ${req.method} ${req.originalUrl || req.url}`
  );
  next();
});

// cors middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.headers.origin) {
    res.header('Access-Control-Allow-Origin', req.headers.origin as string);
  }
  res.header(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS, PATCH'
  );
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Last-Event-ID, ngrok-skip-browser-warning, bypass-tunnel-reminder, sentry-trace, baggage'
  );
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

console.log('--- Environment Check ---');
console.log(`PORT: ${PORT}`);
console.log(
  `COOKIES_URL: ${process.env.COOKIES_URL ? '✅ LOADED' : '❌ MISSING'}`
);
console.log(
  `GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ LOADED' : '❌ MISSING'}`
);
console.log(
  `GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '✅ LOADED' : '❌ MISSING'}`
);

dns.lookup('google.com', { family: 4 }, (err, addr) => {
  const status = err ? '❌ FAILED' : `✅ ${addr}`;
  console.log(`DNS google.com: ${status}`);
});
dns.lookup('youtube.com', { family: 4 }, (err, addr) => {
  const status = err ? '❌ FAILED' : `✅ ${addr}`;
  console.log(`DNS youtube.com: ${status}`);
});
console.log('-------------------------');

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// core routes
const TEMP_DIR = path.join(__dirname, 'temp');
const CACHE_DIR = path.join(TEMP_DIR, 'yt-dlp-cache');

[TEMP_DIR, CACHE_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

console.log('[System] Initializing routes...');
app.get('/ping', (_req: Request, res: Response) => {
  res.status(200).send('pong');
});

app.get('/api/get-url', async (_req: Request, res: Response) => {
  try {
    if (db) {
      const result = (await db.execute({
        sql: "SELECT value FROM configs WHERE key = 'BACKEND_URL' LIMIT 1",
        args: [],
      })) as unknown as { rows: Array<{ value: string }> };
      if (result.rows.length > 0) {
        res.json({ url: result.rows[0].value });
        return;
      }
    }
  } catch (error) {
    console.error('[Discovery] Error fetching URL:', error);
  }
  res.json({ url: null });
});

// opt-in auth; off unless API_KEY set
app.use(
  ['/info', '/stream-urls', '/convert', '/proxy', '/api/remix', '/api/key-changer'],
  requireApiKey
);
app.use('/', videoRoutes);
app.use('/api/key-changer', keyChangerRoutes);
app.use('/api/remix', remixRoutes);
console.log('[System] Routes ready');

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    port: PORT,
  });
});

// global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Global Error]', err);
  if (!res.headersSent) {
    const details =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : JSON.stringify(err);
    res.status(500).json({ error: 'Internal Server Error', details });
  }
});

const distPath = path.join(__dirname, '../../frontend/dist');

if (fs.existsSync(distPath) && process.env.API_ONLY !== 'true') {
  app.use(express.static(distPath));
  app.get(/.*/u, (req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith('/events') ||
      req.path.startsWith('/info') ||
      req.path.startsWith('/convert') ||
      req.path.startsWith('/stream-urls') ||
      req.path.startsWith('/proxy') ||
      req.path.startsWith('/api') ||
      req.path.includes('/EME_STREAM_DOWNLOAD/')
    ) {
      next();
      return;
    }

    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (_req: Request, res: Response) => {
    res.send('YouTube to MP4 Backend is running!');
  });
}

export default app;

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);

    server.timeout = 1200000;
    server.keepAliveTimeout = 1200000;
    server.headersTimeout = 1205000;

    import('./services/ytdlp/config.js').then(({ bootstrapCookies }) =>
      bootstrapCookies()
    );

    import('node:child_process').then(({ exec, spawn: spawnChild }) => {
      exec('yt-dlp --version', (err, stdout) => {
        if (err) console.error(`yt-dlp check failed: ${err.message}`);
        else console.log(`yt-dlp: ${stdout.trim()}`);
      });

      exec('ffmpeg -version', (err, stdout) => {
        if (err) console.error(`FFmpeg check failed: ${err.message}`);
        else console.log(`FFmpeg: ${stdout.split('\n')[0]}`);
      });

      // pot opt-in; bgutil currently fails botguard
      const potEnabled = process.env.ENABLE_POT_PLUGIN === '1';
      if (!potEnabled) {
        console.log('[PO Token] disabled; set ENABLE_POT_PLUGIN=1 to enable');
      } else {
        const potCandidates = [
          process.env.HOME
            ? path.resolve(
                process.env.HOME,
                'bgutil-ytdlp-pot-provider/server/build/main.js'
              )
            : null,
          '/root/bgutil-ytdlp-pot-provider/server/build/main.js',
          '/data/data/com.termux/files/home/bgutil-ytdlp-pot-provider/server/build/main.js',
        ].filter((candidate): candidate is string => Boolean(candidate));
        try {
          const potScript = potCandidates.find((candidate) =>
            fs.existsSync(candidate)
          );
          if (potScript) {
            const pot = spawnChild('node', [potScript], {
              stdio: 'ignore',
              detached: true,
            });
            pot.unref();
            console.log(
              `PO Token server started (pid: ${pot.pid}, port: 4416)`
            );
          } else {
            console.log(
              `[PO Token] Server script not found in: ${potCandidates.join(', ')}`
            );
          }
        } catch (error: unknown) {
          console.error('[PO Token] Spawn failed:', (error as Error).message);
        }
      }
    });

    // warm YT client
    (async () => {
      const warmStart = Date.now();
      try {
        const { getYoutubeClient } =
          await import('./services/extractors/youtube/client.js');
        await getYoutubeClient();
        console.log(
          `[Warmup] Innertube client ready in ${Date.now() - warmStart}ms`
        );
      } catch (error) {
        console.warn(
          '[Warmup] Innertube pre-warm failed (will retry on first request):',
          error instanceof Error ? error.message : error
        );
      }
    })();

    // avoid first request lazy load delay
    (async () => {
      const warmStart = Date.now();
      try {
        await Promise.all([
          import('./services/extractors/index.js'),
          import('./utils/api/response.util.js'),
          import('./services/ytdlp/config.js'),
          import('./utils/network/cookie.util.js'),
        ]);
        console.log(
          `[Warmup] Hot-path modules ready in ${Date.now() - warmStart}ms`
        );
      } catch (error) {
        console.warn(
          '[Warmup] Hot-path module prewarm failed:',
          error instanceof Error ? error.message : error
        );
      }
    })();
  });
}

interface DBExecutor {
  execute: (options: {
    sql: string;
    args: unknown[];
  }) => Promise<{ rows: { id: string }[] }>;
}

async function cleanupTempFiles(): Promise<void> {
  try {
    const files: string[] = await fsPromises.readdir(TEMP_DIR);
    const now: number = Date.now();

    for (const file of files) {
      const filePath: string = path.join(TEMP_DIR, file);
      const stats: fs.Stats = await fsPromises.lstat(filePath);

      if (stats.isFile() && now - stats.mtimeMs > 3600000) {
        await fsPromises.unlink(filePath).catch(() => {
          /* ignore */
        });
      }
    }

    const threeDaysMs: number = 3 * 24 * 60 * 60 * 1000;
    if (db) {
      const executor = db as unknown as DBExecutor;
      const expired = await executor.execute({
        sql: 'SELECT id FROM remix_history WHERE created_at < ?',
        args: [now - threeDaysMs],
      });

      for (const row of expired.rows) {
        const dirPath: string = path.join(STEMS_BASE_DIR, row.id);
        if (fs.existsSync(dirPath)) {
          await fsPromises
            .rm(dirPath, { recursive: true, force: true })
            .catch(() => {
              /* ignore */
            });
        }
        await executor.execute({
          sql: 'DELETE FROM remix_history WHERE id = ?',
          args: [row.id],
        });
        console.log(`[Janitor] Cleaned up expired remix: ${row.id}`);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Cleanup] Error reading temp directory: ${message}`);
  }
}

const tempCleanupInterval = setInterval(() => {
  cleanupTempFiles().catch(() => {
    /* ignore */
  });
}, 3600000);
// allow process exit
tempCleanupInterval.unref?.();
