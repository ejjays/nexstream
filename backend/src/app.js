require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const videoRoutes = require('./routes/video.routes');

const app = express();
const PORT = process.env.PORT || 5000;

console.log('--- Environment Check ---');
console.log(
  `COOKIES_URL: ${process.env.COOKIES_URL ? '✅ LOADED' : '❌ MISSING'}`
);
console.log(
  `GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ LOADED' : '❌ MISSING'}`
);
console.log(
  `GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '✅ LOADED' : '❌ MISSING'}`
);

// DNS Pre-flight Check
require('node:dns').lookup('google.com', (err, addr) => {
  console.log(`DNS google.com: ${err ? '❌ FAILED' : '✅ ' + addr}`);
});
require('node:dns').lookup('youtube.com', (err, addr) => {
  console.log(`DNS youtube.com: ${err ? '❌ FAILED' : '✅ ' + addr}`);
});
console.log('-------------------------');

app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(
  express.json({
    limit: '10mb'
  })
);
app.use(
  express.urlencoded({
    limit: '10mb',
    extended: true
  })
);

app.get('/ping', (req, res) => res.status(200).send('pong'));

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

app.get('/health', (req, res) =>
  res.status(200).json({
    status: 'ok',
    port: PORT
  })
);

const distPath = path.join(__dirname, 'dist');

if (fs.existsSync(distPath)) {
  console.log(`[Server] Serving frontend from: ${distPath}`);
  app.use(express.static(distPath));
  app.get('/*path', (req, res, next) => {
    if (
      req.path.startsWith('/events') ||
      req.path.startsWith('/info') ||
      req.path.startsWith('/convert')
    ) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.warn(`[Server] Frontend NOT found at: ${distPath}`);
  app.get('/', (req, res) =>
    res.send('YouTube to MP4 Backend is running! (Frontend build not found)')
  );
}

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  spawn('yt-dlp', ['--version']).stdout.on('data', d =>
    console.log(`yt-dlp: ${d.toString().trim()}`)
  );
  spawn('ffmpeg', ['-version']).stdout.on('data', d =>
    console.log(`FFmpeg: ${d.toString().split('\n')[0]}`)
  );
  spawn('deno', ['--version']).on('error', () =>
    console.warn('Deno not found, JS solving might be slower.')
  );
});

const fsPromises = require('node:fs').promises;

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
