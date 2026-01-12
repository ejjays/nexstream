const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

// Function to download cookies from a remote URL
async function downloadCookies() {
    const cookieUrl = process.env.COOKIE_URL;
    if (!cookieUrl) return null;

    const cookiesPath = path.join(__dirname, 'temp_cookies.txt');
    
    return new Promise((resolve) => {
        const file = fs.createWriteStream(cookiesPath);
        https.get(cookieUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log('Remote cookies downloaded successfully');
                resolve(cookiesPath);
            });
        }).on('error', (err) => {
            console.error('Error downloading cookies:', err);
            resolve(null);
        });
    });
}

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['Content-Disposition'] 
}));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('YouTube to MP4 Backend is running!');
});

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

// Ensure yt-dlp cache directory exists
const CACHE_DIR = path.join(TEMP_DIR, 'yt-dlp-cache');
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Store active SSE connections
const clients = new Map();

app.get('/events', (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).end();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.set(id, res);

    req.on('close', () => {
        clients.delete(id);
    });
});

function sendEvent(id, data) {
    const client = clients.get(id);
    if (client) {
        client.write(`data: ${JSON.stringify(data)}
\n`);
    }
}

app.get('/info', async (req, res) => {
    const videoURL = req.query.url;
    if (!videoURL) return res.status(400).json({ error: 'No URL provided' });

    console.log(`Fetching info for: ${videoURL}`);
    const cookiesPath = await downloadCookies();
    const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

    const infoProcess = spawn('yt-dlp', [
        ...cookieArgs,
        '--dump-json',
        '--no-playlist',
        '--extractor-args', 'youtube:player_client=tv,web',
        '--js-runtimes', 'node',
        '--remote-components', 'ejs:github',
        '--cache-dir', CACHE_DIR,
        videoURL
    ], {
        env: { ...process.env }
    });
    let infoData = '';
    let infoError = '';

    infoProcess.stdout.on('data', (data) => infoData += data.toString());
    infoProcess.stderr.on('data', (data) => infoError += data.toString());

    infoProcess.on('close', (code) => {
        if (code !== 0) {
            console.error('yt-dlp info error:', infoError);
            return res.status(500).json({ error: 'Failed to fetch video info' });
        }
        try {
            const info = JSON.parse(infoData);
            
            if (!info.formats) {
                console.error('No formats found in yt-dlp output');
                return res.json({ title: info.title, thumbnail: info.thumbnail, formats: [], audioFormats: [] });
            }

            console.log(`[Debug] All Format IDs found: ${info.formats.map(f => f.format_id).join(', ')}`);
            console.log(`[Debug] Total formats received: ${info.formats.length}`);

            // Filter and map formats
            const formats = info.formats
                .filter(f => {
                    // Include if it's explicitly video OR if it has dimensions
                    const hasVideo = (f.vcodec && f.vcodec !== 'none') || f.height || f.width;
                    const isStoryboard = f.format_id && f.format_id.startsWith('sb');
                    return hasVideo && !isStoryboard;
                })
                .map(f => {
                    let h = f.height || 0;
                    if (!h && f.resolution) {
                        const m = f.resolution.match(/(\d+)p/i) || f.resolution.match(/x(\d+)/);
                        if (m) h = parseInt(m[1]);
                    }
                    
                    let q = f.format_note || f.resolution || (h ? `${h}p` : '');
                    if (/^\d+$/.test(q)) q += 'p';
                    if (!q) q = h ? `${h}p` : 'Unknown';

                    return {
                        format_id: f.format_id,
                        extension: f.ext,
                        quality: q,
                        filesize: f.filesize || f.filesize_approx,
                        fps: f.fps,
                        height: h,
                        vcodec: f.vcodec
                    };
                })
                .filter(f => f.height > 0 || f.quality !== 'Unknown')
                .sort((a, b) => b.height - a.height);

            console.log(`[Debug] Video formats after basic filter: ${formats.length}`);

            const uniqueFormats = [];
            const seenQualities = new Set();
            for (const f of formats) {
                if (!seenQualities.has(f.quality)) {
                    uniqueFormats.push(f);
                    seenQualities.add(f.quality);
                }
            }

            const audioFormats = info.formats
                .filter(f => f.acodec && f.acodec !== 'none') 
                .map(f => ({
                    format_id: f.format_id,
                    extension: f.ext,
                    quality: f.abr ? `${Math.round(f.abr)}kbps` : (f.format_note || 'Audio'),
                    filesize: f.filesize || f.filesize_approx,
                    abr: f.abr || 0,
                    vcodec: f.vcodec
                }))
                .sort((a, b) => {
                    if (a.vcodec === 'none' && b.vcodec !== 'none') return -1;
                    if (a.vcodec !== 'none' && b.vcodec === 'none') return 1;
                    return b.abr - a.abr;
                })
                .reduce((acc, current) => {
                    const x = acc.find(item => item.quality === current.quality);
                    if (!x) return acc.concat([current]);
                    return acc;
                }, []);

            console.log(`[Info] ${info.title}: Found ${uniqueFormats.length} video and ${audioFormats.length} audio formats`);

            res.json({
                title: info.title,
                thumbnail: info.thumbnail,
                duration: info.duration,
                formats: uniqueFormats,
                audioFormats: audioFormats
            });
        } catch (e) {
            console.error('Parse error in /info:', e);
            res.status(500).json({ error: 'Parse error' });
        }
    });
});

app.get('/convert', async (req, res) => {
    const videoURL = req.query.url;
    const clientId = req.query.id || Date.now().toString();
    const format = req.query.format === 'mp3' ? 'mp3' : 'mp4';
    const formatId = req.query.formatId;
    const title = req.query.title || 'video';

    if (!videoURL) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    console.log(`[Convert] Request: ${videoURL} (Format: ${format}, ID: ${formatId})`);

    const cookiesPath = await downloadCookies();
    const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

    const tempFilePath = path.join(TEMP_DIR, `${clientId}_${Date.now()}.${format}`);
    const sanitizedTitle = title.replace(/[<>:"/\\|?*]/g, '').trim() || 'video';
    const filename = `${sanitizedTitle}.${format}`;
    
    try {
        let args = [];
        if (format === 'mp3') {
            args = [
                ...cookieArgs,
                '-f', formatId || 'bestaudio/best',
                '--extract-audio',
                '--audio-format', 'mp3',
                '--no-playlist',
                '--extractor-args', 'youtube:player_client=web,mweb',
                '--js-runtimes', 'node',
                '--cache-dir', CACHE_DIR,
                '-o', tempFilePath,
                videoURL
            ];
        } else {
            // For high quality video, we must merge video + best audio
            // We use -f to pick the specific ID, and -S to ensure best merging decisions
            const fArg = formatId ? `${formatId}+bestaudio/best` : 'bestvideo+bestaudio/best';
            args = [
                ...cookieArgs,
                '-f', fArg,
                '-S', 'res,vcodec:vp9',
                '--merge-output-format', 'mp4',
                '--no-playlist',
                '--js-runtimes', 'node',
                '--cache-dir', CACHE_DIR,
                '--extractor-args', 'youtube:player_client=tv,web',
                '-o', tempFilePath,
                videoURL
            ];
        }

        if (clientId) sendEvent(clientId, { status: 'downloading', progress: 0 });

        console.log(`[Execute] yt-dlp ${args.join(' ')}`);

        const videoProcess = spawn('yt-dlp', args, {
            env: { ...process.env }
        });

        videoProcess.stderr.on('data', (data) => {
            const output = data.toString();
            // Log raw stderr to console for Render logs
            console.log(`[yt-dlp] ${output.trim()}`);
            
            const match = output.match(/download]\s+(\d+\.\d+)%/);
            if (match && clientId) {
                const progress = parseFloat(match[1]);
                sendEvent(clientId, { status: 'downloading', progress });
            }
            if (output.includes('[Merger]') && clientId) {
                sendEvent(clientId, { status: 'merging', progress: 100 });
            }
        });

        videoProcess.on('close', (code) => {
            if (code === 0) {
                if (clientId) sendEvent(clientId, { status: 'completed', progress: 100 });
                
                res.download(tempFilePath, filename, (err) => {
                    if (err) console.error('Error sending file:', err);
                    if (fs.existsSync(tempFilePath)) fs.unlink(tempFilePath, () => {});
                });
            } else {
                console.error(`yt-dlp error code ${code}`);
                if (clientId) sendEvent(clientId, { status: 'error', message: 'Conversion failed' });
                if (!res.headersSent) res.status(500).end();
                if (fs.existsSync(tempFilePath)) fs.unlink(tempFilePath, () => {});
            }
        });

        req.on('close', () => {
            if (videoProcess.exitCode === null) {
                videoProcess.kill();
                if (fs.existsSync(tempFilePath)) fs.unlink(tempFilePath, () => {});
            }
        });

    } catch (error) {
        console.error('Server error:', error);
        if (clientId) sendEvent(clientId, { status: 'error', message: 'Internal server error' });
        if (!res.headersSent) res.status(500).end();
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    
    // Log yt-dlp version
    const versionProcess = spawn('yt-dlp', ['--version']);
    versionProcess.stdout.on('data', (data) => {
        console.log(`yt-dlp version: ${data.toString().trim()}`);
    });

    // Log FFmpeg version
    const ffmpegProcess = spawn('ffmpeg', ['-version']);
    ffmpegProcess.stdout.on('data', (data) => {
        console.log(`FFmpeg status: ${data.toString().split('\n')[0]}`);
    });
    ffmpegProcess.on('error', (err) => {
        console.error('FFmpeg NOT FOUND! 4K merging will fail.');
    });
});

// Cleanup old temp files periodically (every hour)
setInterval(() => {
    fs.readdir(TEMP_DIR, (err, files) => {
        if (err) return;
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(TEMP_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > 3600000) { // 1 hour
                    fs.unlink(filePath, () => {});
                }
            });
        });
    });
}, 3600000);

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
