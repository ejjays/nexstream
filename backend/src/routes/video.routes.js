const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { downloadCookies } = require('../utils/cookie.util');
const { addClient, removeClient, sendEvent } = require('../utils/sse.util');
const { resolveSpotifyToYoutube } = require('../services/spotify.service');
const { getVideoInfo, spawnDownload } = require('../services/ytdlp.service');

const TEMP_DIR = path.join(__dirname, '../../temp');

router.get('/events', (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).end();
    addClient(id, res);
    req.on('close', () => removeClient(id));
});

router.get('/info', async (req, res) => {
    const videoURL = req.query.url;
    const clientId = req.query.id;
    if (!videoURL) return res.status(400).json({ error: 'No URL provided' });

    console.log(`Fetching info for: ${videoURL}`);
    
    const cookiesPath = await downloadCookies();
    const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

    const isSpotify = videoURL.includes('spotify.com');
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: isSpotify ? 10 : 30 });

    const targetURL = await resolveSpotifyToYoutube(videoURL, cookieArgs);
    console.log(`[Info] Target URL: ${targetURL}`);
    
    if (isSpotify && clientId) sendEvent(clientId, { status: 'fetching_info', progress: 25 });

    if (clientId && !isSpotify) {
        setTimeout(() => sendEvent(clientId, { status: 'fetching_info', progress: 70 }), 1500);
    }

    try {
        const info = await getVideoInfo(targetURL, cookieArgs);
        
        if (!info.formats) {
            return res.json({ title: info.title, thumbnail: info.thumbnail, formats: [], audioFormats: [] });
        }

        console.log(`[Debug] All Format IDs found: ${info.formats.map(f => f.format_id).join(', ')}`);
        console.log(`[Debug] Total formats received: ${info.formats.length}`);

        // Filter and map formats (Same logic as before)
        const formats = info.formats
            .filter(f => {
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

        const uniqueFormats = [];
        const seenQualities = new Set();
        for (const f of formats) {
            if (!seenQualities.has(f.quality)) {
                uniqueFormats.push(f);
                seenQualities.add(f.quality);
            }
        }

        const audioFormats = info.formats
            .filter(f => f.acodec && f.acodec !== 'none') // Any format with audio
            .map(f => {
                let quality = 'Audio';
                if (f.abr) {
                    quality = `${Math.round(f.abr)}kbps`;
                } else if (f.tbr && (!f.vcodec || f.vcodec === 'none')) {
                    quality = `${Math.round(f.tbr)}kbps`;
                } else if (f.format_note && f.format_note.includes('kbps')) {
                    quality = f.format_note;
                } else if (f.format_id === '18') {
                    quality = '128kbps (HQ)'; // Format 18 is approx 128kbps AAC
                } else {
                    quality = f.format_note || 'Medium Quality';
                }

                return {
                    format_id: f.format_id,
                    extension: f.ext,
                    quality: quality,
                    filesize: f.filesize || f.filesize_approx,
                    abr: f.abr || 0,
                    vcodec: f.vcodec
                };
            })
            .sort((a, b) => {
                // Prioritize audio-only formats (no vcodec)
                if ((!a.vcodec || a.vcodec === 'none') && (b.vcodec && b.vcodec !== 'none')) return -1;
                if ((a.vcodec && a.vcodec !== 'none') && (!b.vcodec || b.vcodec === 'none')) return 1;
                return b.abr - a.abr;
            })
            .reduce((acc, current) => {
                if (!acc.find(item => item.quality === current.quality)) acc.push(current);
                return acc;
            }, []);

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            formats: uniqueFormats,
            audioFormats: audioFormats
        });
    } catch (err) {
        console.error('Info error:', err);
        res.status(500).json({ error: 'Failed to fetch video info' });
    }
});

router.get('/convert', async (req, res) => {
    let videoURL = req.query.url;
    const clientId = req.query.id || Date.now().toString();
    const format = req.query.format === 'mp3' ? 'mp3' : 'mp4';
    const formatId = req.query.formatId;
    const title = req.query.title || 'video';

    if (!videoURL) return res.status(400).json({ error: 'No URL provided' });

    const cookiesPath = await downloadCookies();
    const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

    if (clientId) sendEvent(clientId, { status: 'initializing', progress: 10 });
    const targetURL = await resolveSpotifyToYoutube(videoURL, cookieArgs);
    console.log(`[Convert] Target URL: ${targetURL}`);
    if (clientId) sendEvent(clientId, { status: 'initializing', progress: 90 });

    const tempFilePath = path.join(TEMP_DIR, `${clientId}_${Date.now()}.${format}`);
    const sanitizedTitle = title.replace(/[<>:"/\\|?*]/g, '').trim() || 'video';
    const filename = `${sanitizedTitle}.${format}`;
    
    try {
        if (clientId) sendEvent(clientId, { status: 'downloading', progress: 0 });

        const videoProcess = spawnDownload(targetURL, { format, formatId, tempFilePath }, cookieArgs);

        videoProcess.stdout.on('data', (data) => {
            const output = data.toString();
            const match = output.match(/download]\s+(\d+\.\d+)%/);
            if (match && clientId) {
                sendEvent(clientId, { status: 'downloading', progress: Math.round(parseFloat(match[1]) * 0.95) });
            }
            if (clientId && (output.includes('[Merger]') || output.includes('[ExtractAudio]'))) {
                sendEvent(clientId, { status: 'merging', progress: 98 });
            }
        });

        videoProcess.stderr.on('data', (data) => {
            console.error(`[yt-dlp Download Error] ${data.toString()}`);
        });

        videoProcess.on('close', (code) => {
            if (code === 0) {
                if (clientId) sendEvent(clientId, { status: 'sending', progress: 99 });
                res.download(tempFilePath, filename, (err) => {
                    if (fs.existsSync(tempFilePath)) fs.unlink(tempFilePath, () => {});
                });
            } else {
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
        console.error('Convert error:', error);
        if (clientId) sendEvent(clientId, { status: 'error', message: 'Internal server error' });
        if (!res.headersSent) res.status(500).end();
    }
});

module.exports = router;
