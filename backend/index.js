const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const videoRoutes = require('./src/routes/video.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Content-Disposition'] 
}));
app.use(express.json());

// Ensure directories exist
const TEMP_DIR = path.join(__dirname, 'temp');
const CACHE_DIR = path.join(TEMP_DIR, 'yt-dlp-cache');

[TEMP_DIR, CACHE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Routes
app.get('/', (req, res) => res.send('YouTube to MP4 Backend is running!'));
app.use('/', videoRoutes);

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

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));