import 'dotenv/config';
import dns from 'node:dns';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'node:fs'; 
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// termux bypass 
if (process.platform === 'android') {
  try {
    const { Module } = await import('module');
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function (this: unknown, name: string, ...args: unknown[]) {
      if (name === '@ffmpeg-installer/ffmpeg') {
        return {
          path: 'ffmpeg',
          version: 'system',
          url: 'https://ffmpeg.org/'
        };
      }
      if (name === 'msgpackr-extract' || name === 'cpu-features') {
        return null;
      }
      return (originalRequire as (...innerArgs: unknown[]) => unknown).apply(this, [name, ...args]);
    };
    console.log('[System] Mocked native modules for Termux compatibility');
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[System] Failed to mock @ffmpeg-installer/ffmpeg: ${message}`);
  }
}

const dnsModule = dns as unknown as { setDefaultResultOrder?: (order: 'ipv4first' | 'ipv6first') => void };
if (dnsModule.setDefaultResultOrder) {
  dnsModule.setDefaultResultOrder('ipv4first');
}

// global error handlers
process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`[Unhandled] reason: ${message}`);
});
process.on('uncaughtException', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Uncaught] error: ${message}`);
    if (err instanceof Error && err.stack) console.error(err.stack);
});

import { traceContext } from './utils/trace.util.js';
import { randomUUID } from 'node:crypto';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.set('trust proxy', true);

app.use((req: Request, res: Response, next: NextFunction) => {
  const traceId = (req.headers['x-correlation-id'] as string) || 
                  (req.query.id as string) || 
                  randomUUID().split('-')[0];
  
  res.setHeader('X-Trace-Id', traceId);
  
  traceContext.run({ traceId }, () => {
    next();
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
    second: '2-digit'
  });
  const traceId = (traceContext.getStore() as { traceId?: string })?.traceId || 'global';
  console.log(`[${timestamp}] [${traceId}] ${req.method} ${req.originalUrl || req.url}`);
  next();
});

// CORS middleware
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
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Last-Event-ID, ngrok-skip-browser-warning, bypass-tunnel-reminder'
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
console.log(`COOKIES_URL: ${process.env.COOKIES_URL ? '✅ LOADED' : '❌ MISSING'}`);
console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ LOADED' : '❌ MISSING'}`);
console.log(`GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '✅ LOADED' : '❌ MISSING'}`);

dns.lookup('google.com', { family: 4 }, (err, addr) => {
  console.log(`DNS google.com: ${err ? '❌ FAILED' : `✅ ${addr}`}`);
});
dns.lookup('youtube.com', { family: 4 }, (err, addr) => {
  console.log(`DNS youtube.com: ${err ? '❌ FAILED' : `✅ ${addr}`}`);
});
console.log('-------------------------');

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use(express.json({ limit: '2000mb' }));
app.use(express.urlencoded({ limit: '2000mb', extended: true }));

// core routes
const TEMP_DIR = path.join(__dirname, 'temp');
const CACHE_DIR = path.join(TEMP_DIR, 'yt-dlp-cache');

[TEMP_DIR, CACHE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

console.log('[System] Initializing routes...');
app.get('/ping', (_req: Request, res: Response) => {
  res.status(200).send('pong');
});

const videoRoutes = (await import('./routes/video.routes.js')).default;
const keyChangerRoutes = (await import('./routes/keychanger.routes.js')).default;
const remixRoutes = (await import('./routes/remix.routes.js')).default;

app.use('/', videoRoutes);
app.use('/api/key-changer', keyChangerRoutes);
app.use('/api/remix', remixRoutes);
console.log('[System] Routes ready');

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    port: PORT
  });
});

// global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Global Error]', err);
  if (!res.headersSent) {
    const details = err instanceof Error
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

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  
  server.timeout = 1200000;
  server.keepAliveTimeout = 1200000;
  server.headersTimeout = 1205000;

  import('node:child_process').then(({ exec }) => {
    exec('yt-dlp --version', (err, stdout) => {
      if (err) console.error(`yt-dlp check failed: ${err.message}`);
      else console.log(`yt-dlp: ${stdout.trim()}`);
    });

    exec('ffmpeg -version', (err, stdout) => {
      if (err) console.error(`FFmpeg check failed: ${err.message}`);
      else console.log(`FFmpeg: ${stdout.split('\n')[0]}`);
    });
  });
});


const fsPromises = fs.promises;
const db = (await import('./utils/db.util.js')).default;
const STEMS_BASE_DIR = path.join(__dirname, '../temp/remix_stems');

interface DBExecutor {
  execute: (options: { sql: string, args: unknown[] }) => Promise<{ rows: { id: string }[] }>;
}

async function cleanupTempFiles(): Promise<void> {
  try {
    const files: string[] = await fsPromises.readdir(TEMP_DIR);
    const now: number = Date.now();

    for (const file of files) {
      const filePath: string = path.join(TEMP_DIR, file);
      const stats: fs.Stats = await fsPromises.lstat(filePath);

      if (stats.isFile() && now - stats.mtimeMs > 3600000) {
        await fsPromises.unlink(filePath).catch(() => { /* ignore */ });
      }
    }

    const threeDaysMs: number = 3 * 24 * 60 * 60 * 1000;
    if (db) {
      const executor = db as unknown as DBExecutor;
      const expired = await executor.execute({
        sql: 'SELECT id FROM remix_history WHERE created_at < ?',
        args: [now - threeDaysMs]
      });

      for (const row of expired.rows) {
        const dirPath: string = path.join(STEMS_BASE_DIR, row.id);
        if (fs.existsSync(dirPath)) {
          await fsPromises.rm(dirPath, { recursive: true, force: true }).catch(() => { /* ignore */ });
        }
        await executor.execute({
          sql: 'DELETE FROM remix_history WHERE id = ?',
          args: [row.id]
        });
        console.log(`[Janitor] Cleaned up expired remix: ${row.id}`);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Cleanup] Error reading temp directory: ${message}`);
  }
}

setInterval(() => {
  cleanupTempFiles().catch(() => { /* ignore */ });
}, 3600000);
