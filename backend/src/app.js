require('dotenv').config();

if (process.platform === 'android') {
  try {
    const Module = require('module');
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function (name) {
      if (name === '@ffmpeg-installer/ffmpeg') {
        return {
          path: 'ffmpeg',
          version: 'system',
          url: 'https://ffmpeg.org/'
        };
      }
      return originalRequire.apply(this, arguments);
    };
    console.log('[System] Mocked @ffmpeg-installer/ffmpeg for Termux compatibility');
  } catch (e) {
    console.warn('[System] Failed to mock @ffmpeg-installer/ffmpeg:', e.message);
  }
}

const dns = require('node:dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const express = require('express');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const videoRoutes = require('./routes/video.routes');
const keyChangerRoutes = require('./routes/keychanger.routes');
const remixRoutes = require('./routes/remix.routes');

// global error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled] reason:', reason.message || reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Uncaught] error:', err.message);
});

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', true);

app.use((req, res, next) => {
  if (req.path === '/ping' || req.method === 'OPTIONS') return next();
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl || req.url}`);
  next();
});

app.use((req, res, next) => {
  if (req.headers.origin) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
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
    return res.status(200).end();
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

require('node:dns').lookup('google.com', { family: 4 }, (err, addr) => {
  console.log(`DNS google.com: ${err ? '❌ FAILED' : '✅ ' + addr}`);
});
require('node:dns').lookup('youtube.com', { family: 4 }, (err, addr) => {
  console.log(`DNS youtube.com: ${err ? '❌ FAILED' : '✅ ' + addr}`);
});
console.log('-------------------------');

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use(
  express.json({
    limit: '2000mb'
  })
);
app.use(
  express.urlencoded({
    limit: '2000mb',
    extended: true
  })
);

const videoController = require('./controllers/video.controller');
app.get('/events', videoController.streamEvents);

app.get('/ping', (req, res) => res.status(200).send('pong'));

app.get('/debug-sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  let count = 0;
  const timer = setInterval(() => {
    res.write(`data: ${JSON.stringify({ count: count++ })}\n\n`);
  }, 1000);

  req.on('close', () => clearInterval(timer));
});

const TEMP_DIR = path.join(__dirname, 'temp');
const CACHE_DIR = path.join(TEMP_DIR, 'yt-dlp-cache');

[TEMP_DIR, CACHE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true
    });
  }
});

app.use('/', videoRoutes);
app.use('/api/key-changer', keyChangerRoutes);
app.use('/api/remix', remixRoutes);

app.get('/health', (req, res) =>
  res.status(200).json({
    status: 'ok',
    port: PORT
  })
);

app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  if (!res.headersSent) {
    res
      .status(500)
      .json({ error: 'Internal Server Error', details: err.message });
  }
});

const distPath = path.join(__dirname, '../../frontend/dist');

if (fs.existsSync(distPath) && process.env.API_ONLY !== 'true') {
  app.use(express.static(distPath));
  app.get(/.*/, (req, res, next) => {
    if (
      req.path.startsWith('/events') ||
      req.path.startsWith('/info') ||
      req.path.startsWith('/convert') ||
      req.path.startsWith('/stream-urls') ||
      req.path.startsWith('/proxy') ||
      req.path.startsWith('/api') ||
      req.path.startsWith('/api')
    ) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.send('YouTube to MP4 Backend is running!'));
}

const { exec } = require('node:child_process');

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  
  // Set explicit timeouts for long GPU separations
  server.timeout = 1200000; // 20 minutes
  server.keepAliveTimeout = 1200000;
  server.headersTimeout = 1205000;

  exec('yt-dlp --version', (err, stdout) => {
    if (err) console.error('yt-dlp check failed:', err.message);
    else console.log(`yt-dlp: ${stdout.trim()}`);
  });

  exec('ffmpeg -version', (err, stdout) => {
    if (err) console.error('FFmpeg check failed:', err.message);
    else console.log(`FFmpeg: ${stdout.split('\n')[0]}`);
  });
});

const fsPromises = require('node:fs').promises;
const db = require('./utils/db.util');
const STEMS_BASE_DIR = path.join(__dirname, '../temp/remix_stems');

async function cleanupTempFiles() {
  try {
    const files = await fsPromises.readdir(TEMP_DIR);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fsPromises.lstat(filePath);

      if (stats.isFile() && now - stats.mtimeMs > 3600000) {
        await fsPromises.unlink(filePath).catch(() => {});
      }
    }

// janitor: clean up history
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    if (db) {
      const expired = await db.execute({
        sql: 'SELECT id FROM remix_history WHERE created_at < ?',
        args: [now - threeDaysMs]
      });

      for (const row of expired.rows) {
        const dir = path.join(STEMS_BASE_DIR, row.id);
        if (fs.existsSync(dir)) {
          await fsPromises
            .rm(dir, { recursive: true, force: true })
            .catch(() => {});
        }
        await db.execute({
          sql: 'DELETE FROM remix_history WHERE id = ?',
          args: [row.id]
        });
        console.log(`[Janitor] Cleaned up expired remix: ${row.id}`);
      }
    }
  } catch (err) {
    console.error('[Cleanup] Error reading temp directory:', err.message);
  }
}

setInterval(cleanupTempFiles, 3600000);

process.on('uncaughtException', err => {
  if (err.code === 'ECONNRESET') {
    console.warn(
      '[Server] Client connection reset (ECONNRESET). This is normal during large stream cancellations.'
    );
    return;
  }
  console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
