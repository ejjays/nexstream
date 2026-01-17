const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { downloadCookies } = require('../utils/cookie.util');
const { addClient, removeClient, sendEvent } = require('../utils/sse.util');
const { resolveSpotifyToYoutube } = require('../services/spotify.service');
const { getVideoInfo, spawnDownload, downloadImage, injectMetadata, downloadImageToBuffer } = require('../services/ytdlp.service');

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
    if (clientId) sendEvent(clientId, { status: 'fetching_info', progress: isSpotify ? 5 : 30 });

    const spotifyData = isSpotify 
        ? await resolveSpotifyToYoutube(videoURL, cookieArgs, (status, progress) => {
            if (clientId) sendEvent(clientId, { status, progress });
          }) 
        : null;
    const targetURL = isSpotify ? spotifyData.targetUrl : videoURL;
    
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

        // Filter and map formats
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
                
                // FIXED: Prioritize resolution (e.g. 720p) over generic "DASH video" notes
                let q = h ? `${h}p` : '';
                if (!q) {
                    q = f.format_note || f.resolution || 'Unknown';
                }
                
                if (/^\d+$/.test(q)) q += 'p';
                if (!q) q = 'Unknown';

                // ESTIMATE SIZE: If size is missing, calculate from bitrate (tbr) and duration
                let size = f.filesize || f.filesize_approx;
                if (!size && f.tbr && info.duration) {
                    size = Math.floor((f.tbr * 1000 * info.duration) / 8);
                }

                return {
                    format_id: f.format_id,
                    extension: f.ext,
                    quality: q,
                    filesize: size,
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

        // SMART FALLBACKS for Instagram/Facebook
        let finalTitle = info.title;
        if (!finalTitle || finalTitle.startsWith('Video by') || finalTitle.startsWith('Reel by') || finalTitle.toLowerCase() === 'instagram') {
             if (info.description) {
                 finalTitle = info.description.split('\n')[0].substring(0, 60).trim(); // Use caption
             } else {
                 finalTitle = `Video_${Date.now()}`;
             }
        }

        let finalThumbnail = info.thumbnail;
        if (!finalThumbnail && info.thumbnails && info.thumbnails.length > 0) {
            // Find biggest width
            const best = info.thumbnails.reduce((prev, current) => {
                return (prev.width || 0) > (current.width || 0) ? prev : current;
            });
            finalThumbnail = best.url;
        }

        // PROXY: If Instagram/Facebook, proxy the image to base64 to avoid 403/CORs
        if (finalThumbnail && (videoURL.includes('instagram.com') || videoURL.includes('facebook.com'))) {
            try {
                const imgBuffer = await downloadImageToBuffer(finalThumbnail);
                const base64Img = imgBuffer.toString('base64');
                finalThumbnail = `data:image/jpeg;base64,${base64Img}`;
                console.log('[Proxy] Successfully converted thumbnail to Base64');
            } catch (proxyErr) {
                console.warn('[Proxy] Failed to proxy thumbnail:', proxyErr.message);
            }
        }

        console.log(`[Info] Title: "${finalTitle}" | Cover: ${finalThumbnail ? 'Found' : 'Missing'}`);

        res.json({
            title: isSpotify ? spotifyData.title : finalTitle,
            artist: isSpotify ? spotifyData.artist : (info.uploader || ''),
            album: isSpotify ? spotifyData.album : '',
            cover: isSpotify ? spotifyData.imageUrl : finalThumbnail,
            thumbnail: isSpotify ? spotifyData.imageUrl : finalThumbnail,
            duration: info.duration,
            formats: uniqueFormats,
            audioFormats: audioFormats,
            spotifyMetadata: spotifyData
        });
    } catch (err) {
        console.error('Info error:', err);
        res.status(500).json({ error: 'Failed to fetch video info' });
    }
});

router.all('/convert', async (req, res) => {
    // Merge query and body to support both GET and POST
    const data = { ...req.query, ...req.body };

    let videoURL = data.url;
    const clientId = data.id || Date.now().toString();
    const format = data.format === 'mp3' ? 'mp3' : 'mp4';
    const formatId = data.formatId;
    const title = data.title || 'video';
    
    // Extract Spotify Metadata if present
    const spotifyMetadata = {
        title: data.title,
        artist: data.artist,
        album: data.album,
        imageUrl: data.imageUrl,
        year: data.year
    };

    if (!videoURL) return res.status(400).json({ error: 'No URL provided' });

    const cookiesPath = await downloadCookies();
    const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

    if (clientId) sendEvent(clientId, { status: 'initializing', progress: 10 });
    
    let targetURL = data.targetUrl;
    let spotifyData = null;

    if (!targetURL) {
        // Resolve URL (Gemini 3 will handle this)
        spotifyData = videoURL.includes('spotify.com') ? await resolveSpotifyToYoutube(videoURL, cookieArgs) : null;
        targetURL = spotifyData ? spotifyData.targetUrl : videoURL;
    }
    
    const finalMetadata = spotifyData ? {
        title: spotifyData.title,
        artist: spotifyData.artist,
        album: spotifyData.album,
        imageUrl: spotifyData.imageUrl,
        year: spotifyData.year,
        duration: spotifyData.duration
    } : { ...spotifyMetadata, duration: data.duration };

    console.log(`[Convert] Target URL: ${targetURL}`);
    if (clientId) sendEvent(clientId, { status: 'initializing', progress: 90 });

    const tempFilePath = path.join(TEMP_DIR, `${clientId}_${Date.now()}.${format}`);
    const coverPath = path.join(TEMP_DIR, `${clientId}_cover.jpg`);
    
    const sanitizedTitle = (finalMetadata.title || title).replace(/[<>:"/\\|?*]/g, '').trim() || 'video';
    const filename = `${sanitizedTitle}.${format}`;
    
    try {
        if (clientId) sendEvent(clientId, { status: 'downloading', progress: 0 });

        // Download cover art if available
        let finalCoverPath = null;
        if (finalMetadata.imageUrl) {
            try {
                if (finalMetadata.imageUrl.startsWith('data:image')) {
                    // Handle Base64 Image
                    const base64Data = finalMetadata.imageUrl.replace(/^data:image\/\w+;base64,/, "");
                    const buf = Buffer.from(base64Data, 'base64');
                    fs.writeFileSync(coverPath, buf);
                    finalCoverPath = coverPath;
                    console.log('[Convert] Saved Base64 cover to disk');
                } else {
                    // Handle URL Download
                    finalCoverPath = await downloadImage(finalMetadata.imageUrl, coverPath);
                }
            } catch (e) {
                console.warn('[Metadata] Cover download/save failed:', e.message);
            }
        }

        const videoProcess = spawnDownload(targetURL, { 
            format, 
            formatId, 
            tempFilePath, 
            metadata: { ...finalMetadata, coverFile: finalCoverPath } 
        }, cookieArgs);

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

        videoProcess.on('close', async (code) => {
            if (code === 0) {
                if (clientId) sendEvent(clientId, { status: 'merging', progress: 99 });
                
                // NEW: Inject metadata separately
                try {
                    await injectMetadata(tempFilePath, { ...finalMetadata, coverFile: finalCoverPath });
                } catch (tagError) {
                    console.warn('[Metadata] Injection failed but continuing:', tagError.message);
                }

                if (clientId) sendEvent(clientId, { status: 'sending', progress: 99 });
                res.download(tempFilePath, filename, (err) => {
                    if (fs.existsSync(tempFilePath)) fs.unlink(tempFilePath, () => {});
                    if (fs.existsSync(coverPath)) fs.unlink(coverPath, () => {});
                });
            } else {
                if (clientId) sendEvent(clientId, { status: 'error', message: 'Conversion failed' });
                if (!res.headersSent) res.status(500).end();
                if (fs.existsSync(tempFilePath)) fs.unlink(tempFilePath, () => {});
                if (fs.existsSync(coverPath)) fs.unlink(coverPath, () => {});
            }
        });

        req.on('close', () => {
            if (videoProcess.exitCode === null) {
                videoProcess.kill();
                if (fs.existsSync(tempFilePath)) fs.unlink(tempFilePath, () => {});
                if (fs.existsSync(coverPath)) fs.unlink(coverPath, () => {});
            }
        });
    } catch (error) {
        console.error('Convert error:', error);
        if (clientId) sendEvent(clientId, { status: 'error', message: 'Internal server error' });
        if (!res.headersSent) res.status(500).end();
    }
});

module.exports = router;