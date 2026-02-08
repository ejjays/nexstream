require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const videoRoutes = require('./src/routes/video.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Verify Secrets on Startup
console.log('--- Environment Check ---');
console.log(`COOKIES_URL: ${process.env.COOKIES_URL ? '✅ LOADED' : '❌ MISSING'}`);
console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ LOADED' : '❌ MISSING'}`);
console.log(`GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '✅ LOADED' : '❌ MISSING'}`);

// DNS Pre-flight Check
require('dns').lookup('google.com', (err, addr) => {
    console.log(`DNS google.com: ${err ? '❌ FAILED' : '✅ ' + addr}`);
});
require('dns').lookup('youtube.com', (err, addr) => {
    console.log(`DNS youtube.com: ${err ? '❌ FAILED' : '✅ ' + addr}`);
});
console.log('-------------------------');

// Middleware
app.use(cors());
app.options('/*path', cors()); // Enable pre-flight for all routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Localtunnel/Ngrok Bypass Middleware
app.use((req, res, next) => {
    res.setHeader('bypass-tunnel-reminder', 'true');
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});

// Ensure directories exist
const TEMP_DIR = path.join(__dirname, 'temp');
const CACHE_DIR = path.join(TEMP_DIR, 'yt-dlp-cache');

[TEMP_DIR, CACHE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Routes
app.use('/', videoRoutes);

// Serve Frontend Static Files
const FRONTEND_DfR = path.join(__dirname, '../dist');
if (fs.existsSync(FRONTEND_DfR)) {
    app.use(express.static(FRONTEND_DfR));
    app.get('/*path', (req, res) => {
        res.sendFile(path.join(FRONTEND_DfR, 'index.html'));
    });
} else {
    app.get('/', (req, res) => res.send('YouTube to MP4 Backend is running! (Frontend build not found)'));
}

// Start server
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    
    // Log environment info
    spawn('yt-dlp', ['--version']).stdout.on('data', (d) => console.log(`yt-dlp: ${d.toString().trim()}`));
    spawn('ffmpeg', ['-version']).stdout.on('data', (d) => console.log(`FFmpeg: ${d.toString().split('\n')[0]}`));
    spawn('deno', ['--version']).on('error', () => console.warn('Deno not found, JS solving might be slower.'));
});

// Periodically cleanup temp files (every hour)
setInterval(() => {
    fs.readdir(TEMP_DIR, (err, files) => {
        if (err) return;
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(TEMP_DIR, file);
            if (fs.lstatSync(filePath).isFile()) {
                fs.stat(filePath, (err, stats) => {
                    if (!err && now - stats.mtimeMs > 3600000) fs.unlink(filePath, () => {});
                });
            }
        });
    });
}, 3600000);

process.on('uncaughtException', (err) => {
    // Gracefully handle ECONNRESET (Client closed connection during stream)
    if (err.code === 'ECONNRESET') {
        console.warn('[Server] Client connection reset (ECONNRESET). This is normal during large stream cancellations.');
        return;
    }
    console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});