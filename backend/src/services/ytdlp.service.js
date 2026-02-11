const { spawn, exec } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs').promises;
const https = require('node:https');
const { PassThrough } = require('node:stream');
const axios = require('axios');

// GLOBAL CONCURRENCY SEMAPHORE (Max 2 heavy processes for Render stability)
const MAX_CONCURRENT = 2;
let activeProcesses = 0;
const processQueue = [];

function acquireLock() {
    return new Promise(resolve => {
        if (activeProcesses < MAX_CONCURRENT) {
            activeProcesses++;
            resolve();
        } else {
            processQueue.push(resolve);
        }
    });
}

function releaseLock() {
    activeProcesses--;
    if (processQueue.length > 0) {
        activeProcesses++;
        const next = processQueue.shift();
        next();
    }
}

const COMMON_ARGS = [
    '--ignore-config',
    '--no-playlist',
    '--remote-components', 'ejs:github',
    '--force-ipv4',
    '--no-check-certificates',
    '--socket-timeout', '30',
    '--retries', '3',
    '--no-colors',
];

const CACHE_DIR = path.join(__dirname, '../../temp/yt-dlp-cache');

// Metadata Cache to prevent redundant yt-dlp calls
const metadataCache = new Map();
const METADATA_EXPIRY = 2 * 60 * 60 * 1000; // 2 Hours (Ultra-Fast Repeat Downloads)

async function downloadImage(url, dest) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        await fsPromises.writeFile(dest, response.data);
        return dest;
    } catch (err) {
        if (fs.existsSync(dest)) {
            await fsPromises.unlink(dest).catch(() => {});
        }
        throw err;
    }
}

const { isSupportedUrl } = require('../utils/validation.util');

async function getVideoInfo(url, cookieArgs = [], forceRefresh = false) {
    const cacheKey = `${url}_${cookieArgs.join('_')}`;
    
    const cached = metadataCache.get(cacheKey);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp < METADATA_EXPIRY)) {
        return cached.data;
    }

    if (!isSupportedUrl(url)) throw new Error('Unsupported or malicious URL');

    let targetUrl = url;
    if (url.includes('bili.im') || url.includes('facebook.com/share')) {
        targetUrl = await expandShortUrl(url);
    }

    await acquireLock();
    try {
        const info = await runYtdlpInfo(targetUrl, cookieArgs);
        metadataCache.set(cacheKey, { data: info, timestamp: Date.now() });
        return info;
    } finally {
        releaseLock();
    }
}

async function expandShortUrl(url) {
    try {
        const parsed = new URL(url);
        const isBili = parsed.hostname === 'bili.im';
        const isFb = parsed.hostname === 'facebook.com' || parsed.hostname.endsWith('.facebook.com');
        
        if (!isBili && !isFb) return url;

        const base = isBili ? 'https://bili.im' : 'https://www.facebook.com';
        
        // Use a strict whitelist of allowed characters for the path and query string
        // This is safer than a blacklist and should satisfy static analysis
        const safePath = parsed.pathname.match(/^[a-zA-Z0-9\/\-_]+$/) ? parsed.pathname : '/';
        const safeSearch = parsed.search.match(/^[a-zA-Z0-9\?&=%\-_]+$/) ? parsed.search : '';
        
        const safeUrl = `${base}${safePath}${safeSearch}`;

        const res = await axios.head(safeUrl, { 
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' }
        });
        return res.request.res.responseUrl || url;
    } catch (e) {
        console.warn(`[Resolver] Failed to expand ${url}: ${e.message}`);
        return url;
    }
}

function runYtdlpInfo(targetUrl, cookieArgs) {
    return new Promise((resolve, reject) => {
        const isYoutube = targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be');
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
        
        const refererMap = { 'facebook.com': 'https://www.facebook.com/', 'bilibili.com': 'https://www.bilibili.com/', 'x.com': 'https://x.com/' };
        const referer = Object.entries(refererMap).find(([domain]) => targetUrl.includes(domain))?.[1] || '';
        
        const args = [...cookieArgs, '--dump-json', '--user-agent', userAgent, ...COMMON_ARGS, '--cache-dir', CACHE_DIR];
        if (referer) args.push('--referer', referer);
        if (isYoutube) args.push('--extractor-args', 'youtube:player_client=web_safari,android_vr,tv');
        args.push(targetUrl);

        const proc = spawn('yt-dlp', args);
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => stdout += d);
        proc.stderr.on('data', (d) => stderr += d);
        proc.on('close', (code) => {
            if (code !== 0) return reject(new Error(stderr));
            try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
        });
    });
}

function cacheVideoInfo(url, data, cookieArgs = []) {
    const cacheKey = `${url}_${cookieArgs.join('_')}`;
    metadataCache.set(cacheKey, { data, timestamp: Date.now() });
    console.log(`[Cache] Manually injected metadata for: ${url}`);
}

function spawnDownload(url, options, cookieArgs = [], preFetchedInfo = null) {
    const { format, formatId, tempFilePath } = options;
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

    const baseArgs = [
        ...cookieArgs,
        '--user-agent', userAgent,
        ...COMMON_ARGS,
        '--cache-dir', CACHE_DIR,
        '--newline',
        '--progress',
        '-o', tempFilePath,
    ];

    if (isYoutube) {
        const clientArg = 'youtube:player_client=web_safari,android_vr,tv';
        baseArgs.push('--extractor-args', clientArg);
    }

    baseArgs.push(url);

    let args = [];
    if (format === 'mp3' || format === 'm4a' || format === 'webm' || format === 'audio') {
        const fId = formatId || 'bestaudio[ext=m4a]/bestaudio';
        if (format !== 'mp3') {
            args = ['-f', fId, ...baseArgs];
        } else {
            args = ['-f', fId, '--extract-audio', '--audio-format', 'mp3', ...baseArgs];
        }
    } else {
        const fArg = formatId ? `${formatId}+bestaudio/best` : 'bestvideo+bestaudio/best';
        args = ['-f', fArg, '-S', 'res,vcodec:vp9', '--merge-output-format', 'mp4', ...baseArgs];
    }

    console.log(`[Download] yt-dlp ${args.join(' ')}`);
    return spawn('yt-dlp', args);
}

function getNetscapeCookieString(cookiesFile, targetUrl) {
    if (!cookiesFile || !fs.existsSync(cookiesFile)) return '';
    try {
        const domain = new URL(targetUrl).hostname.split('.').slice(-2).join('.');
        return fs.readFileSync(cookiesFile, 'utf8').split('\n')
            .filter(l => l && !l.startsWith('#') && l.includes(domain))
            .map(l => { const p = l.split('\t'); return `${p[5]}=${p[6]}`; })
            .join('; ');
    } catch {
        return '';
    }
}

function handleMp3Stream(url, formatId, cookieArgs, preFetchedInfo) {
    const combinedStderr = new PassThrough();
    const combinedStdout = new PassThrough();
    
    let ffmpegProcess = null;
    const EventEmitter = require('node:events');
    const eventBus = new EventEmitter();

    const proxy = {
        stdout: combinedStdout,
        stderr: combinedStderr,
        kill: () => {
            if (ffmpegProcess && ffmpegProcess.exitCode === null) ffmpegProcess.kill('SIGKILL');
        },
        on: (event, cb) => {
            if (event === 'close') eventBus.on('close', cb);
            else combinedStdout.on(event, cb);
        },
        get exitCode() { return ffmpegProcess ? ffmpegProcess.exitCode : null; }
    };

    (async () => {
        try {
            // OPTIMIZATION: If preFetchedInfo already has the format URL, skip the heavy info call
            let audioFormat = preFetchedInfo?.formats?.find(f => f.format_id === formatId && f.url);
            let info = preFetchedInfo;

            if (!audioFormat) {
                info = preFetchedInfo || await getVideoInfo(url, cookieArgs);
                audioFormat = info.formats.find(f => f.format_id === formatId) || 
                              info.formats.filter(f => f.acodec !== 'none').sort((a,b) => (b.abr || 0) - (a.abr || 0))[0];
            }
            
            if (!audioFormat?.url) throw new Error('No audio URL found');

            const userAgent = info?.http_headers?.['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            const referer = info?.http_headers?.['Referer'] || info?.webpage_url || '';
            
            const cookiesFile = cookieArgs.join(' ').includes('--cookies') ? cookieArgs[cookieArgs.indexOf('--cookies') + 1] : null;
            const cookieString = getNetscapeCookieString(cookiesFile, audioFormat.url);

            const ffmpegArgs = [
                '-hide_banner', '-loglevel', 'error', 
                '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
                '-user_agent', userAgent,
                ...(referer ? ['-referer', referer] : []),
                ...(cookieString ? ['-cookies', cookieString] : []),
                '-i', audioFormat.url,
                '-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', 'pipe:1'
            ];

            console.log(`[Stream] Pipe MP3: ffmpeg ${ffmpegArgs.join(' ')}`);
            ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
            ffmpegProcess.stderr.on('data', (d) => {
                const msg = d.toString();
                if (!msg.includes('size=') && !msg.includes('time=') && msg.trim()) {
                    console.error(`[FFmpeg STDERR] ${msg.trim()}`);
                }
            });
            ffmpegProcess.stdout.pipe(combinedStdout);
            ffmpegProcess.on('close', (code) => eventBus.emit('close', code));
        } catch (err) {
            combinedStdout.emit('error', err);
            eventBus.emit('close', 1);
        }
    })();

    return proxy;
}

function handleVideoStream(url, formatId, cookieArgs, preFetchedInfo) {
    const combinedStderr = new PassThrough();
    const combinedStdout = new PassThrough();
    
    let ffmpegProcess = null;
    const EventEmitter = require('node:events');
    const eventBus = new EventEmitter();

    const proxy = {
        stdout: combinedStdout,
        stderr: combinedStderr,
        kill: () => {
            if (ffmpegProcess && ffmpegProcess.exitCode === null) ffmpegProcess.kill('SIGKILL');
        },
        on: (event, cb) => {
            if (event === 'close') eventBus.on('close', cb);
            else combinedStdout.on(event, cb);
        },
        get exitCode() { return ffmpegProcess ? ffmpegProcess.exitCode : null; }
    };

    (async () => {
        try {
            const info = preFetchedInfo || await getVideoInfo(url, cookieArgs);
            const videoFormat = info.formats.find(f => f.format_id === formatId) || { url: null };
            
            // Check if video already has audio to avoid redundant muxing (Fixes TikTok/Reddit issues)
            const videoHasAudio = videoFormat.acodec && videoFormat.acodec !== 'none';
            
            const audioFormat = videoHasAudio ? { url: null } : info.formats
                .filter(f => f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
                .sort((a, b) => {
                    const aIsAac = a.acodec?.includes('aac');
                    const bIsAac = b.acodec?.includes('aac');
                    if (aIsAac && !bIsAac) return -1;
                    if (!aIsAac && bIsAac) return 1;
                    return (b.abr || 0) - (a.abr || 0);
                })[0] || { url: null };

            if (!videoFormat.url) throw new Error('No video URL found');

            const userAgent = info.http_headers?.['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            const referer = info.http_headers?.['Referer'] || info.webpage_url || '';
            const cookiesFile = cookieArgs.join(' ').includes('--cookies') ? cookieArgs[cookieArgs.indexOf('--cookies') + 1] : null;
            
            // Pass ALL yt-dlp headers to FFmpeg (Fixes 403 Forbidden)
            let customHeaders = '';
            if (info.http_headers) {
                Object.entries(info.http_headers).forEach(([key, val]) => {
                    const k = key.toLowerCase();
                    if (k !== 'user-agent' && k !== 'referer' && k !== 'host') {
                        customHeaders += `${key}: ${val}\r\n`;
                    }
                });
            }

            const videoCookies = getNetscapeCookieString(cookiesFile, videoFormat.url);
            
            // IF IT'S TIKTOK OR REDDIT, USE DOUBLE-PIPE TO BYPASS 403 / AUTH ISSUES
            const isTiktok = url.includes('tiktok.com');
            const isReddit = url.includes('reddit.com');

            if ((isTiktok || isReddit) && videoHasAudio && !audioFormat.url) {
                console.log(`[Stream] Double-Pipe Mode: yt-dlp -> ffmpeg (Bypassing Auth/403)`);
                
                const ytdlpArgs = [
                    ...cookieArgs, '--user-agent', userAgent, ...COMMON_ARGS,
                    '--cache-dir', CACHE_DIR, '-f', formatId || 'best', '-o', '-', url
                ];
                
                const ytdlpProc = spawn('yt-dlp', ytdlpArgs);
                const ffmpegProc = spawn('ffmpeg', [
                    '-hide_banner', '-loglevel', 'error',
                    '-i', 'pipe:0',
                    '-c', 'copy',
                    '-bsf:a', 'aac_adtstoasc', // CRITICAL: Fixes malformed AAC bitstream errors
                    '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1'
                ]);

                // Safe Piping with EPIPE protection
                ytdlpProc.stdout.on('data', (chunk) => {
                    if (ffmpegProc.stdin.writable) {
                        ffmpegProc.stdin.write(chunk);
                    }
                });

                ytdlpProc.stdout.on('end', () => {
                    if (ffmpegProc.stdin.writable) ffmpegProc.stdin.end();
                });

                ffmpegProc.stdout.pipe(combinedStdout);
                
                ytdlpProc.stderr.on('data', (d) => {
                    const msg = d.toString().trim();
                    if (msg && !msg.includes('[download]')) console.error(`[ytdlp-pipe] ${msg}`);
                });

                ffmpegProc.stderr.on('data', (d) => {
                    const msg = d.toString();
                    if (!msg.includes('frame=') && msg.trim()) console.error(`[ffmpeg-pipe] ${msg.trim()}`);
                });

                ffmpegProc.on('close', (code) => eventBus.emit('close', code));
                
                proxy.kill = () => {
                    if (ytdlpProc.exitCode === null) ytdlpProc.kill('SIGKILL');
                    if (ffmpegProc.exitCode === null) ffmpegProc.kill('SIGKILL');
                };
                return;
            }

            // FALLBACK TO MULTI-INPUT MUXING (YouTube/Facebook)
            const ffmpegInputs = ['-user_agent', userAgent];
            if (customHeaders) ffmpegInputs.push('-headers', customHeaders);
            if (referer) ffmpegInputs.push('-referer', referer);
            if (videoCookies) ffmpegInputs.push('-cookies', videoCookies);
            ffmpegInputs.push('-i', videoFormat.url);

            if (audioFormat.url) {
                const audioCookies = getNetscapeCookieString(cookiesFile, audioFormat.url);
                ffmpegInputs.push('-user_agent', userAgent);
                if (customHeaders) ffmpegInputs.push('-headers', customHeaders);
                if (referer) ffmpegInputs.push('-referer', referer);
                if (audioCookies) ffmpegInputs.push('-cookies', audioCookies);
                ffmpegInputs.push('-i', audioFormat.url);
            }

            const ffmpegArgs = [
                '-hide_banner', '-loglevel', 'error',
                ...ffmpegInputs, '-c', 'copy',
                '-bsf:a', 'aac_adtstoasc', // CRITICAL: Fixes bitstream errors for ALL platforms
                '-map', '0:v:0', ...(audioFormat.url ? ['-map', '1:a:0'] : (videoHasAudio ? ['-map', '0:a:0'] : ['-map', '0:a?'])),
                '-shortest', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1'
            ];

            console.log(`[Stream] Pipe video: ffmpeg ${ffmpegArgs.join(' ')}`);
            ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
            ffmpegProcess.stderr.on('data', (d) => {
                const msg = d.toString();
                // Filter out progress logs (frame=...)
                if (!msg.includes('frame=') && !msg.includes('size=') && msg.trim()) {
                    console.error(`[FFmpeg STDERR] ${msg.trim()}`);
                }
            });
            ffmpegProcess.stdout.pipe(combinedStdout);
            ffmpegProcess.on('close', (code) => eventBus.emit('close', code));
        } catch (err) {
            combinedStdout.emit('error', err);
            eventBus.emit('close', 1);
        }
    })();

    return proxy;
}

/**
 * Direct streaming via FFmpeg/yt-dlp to stdout.
 */
function streamDownload(url, options, cookieArgs = [], preFetchedInfo = null) {
    const { format, formatId } = options;
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

    const baseArgs = [
        ...cookieArgs, '--user-agent', userAgent, ...COMMON_ARGS, '--cache-dir', CACHE_DIR,
        '--newline', '--progress', '--progress-template', '[download] %(progress._percent_str)s', '--no-part'
    ];

    if (isYoutube) {
        baseArgs.push('--extractor-args', 'youtube:player_client=web_safari,android_vr,tv');
    }

    baseArgs.push(url);

    if (format === 'mp3') {
        return handleMp3Stream(url, formatId, cookieArgs, preFetchedInfo);
    } 
    
    if (format === 'm4a' || format === 'webm' || format === 'audio' || format === 'opus') {
        const fId = formatId || 'bestaudio[ext=m4a]/bestaudio';
        console.log(`[Stream] Pipe audio: yt-dlp ${['-f', fId, '-o', '-', ...baseArgs].join(' ')}`);
        return spawn('yt-dlp', ['-f', fId, '-o', '-', ...baseArgs]);
    }

    return handleVideoStream(url, formatId, cookieArgs, preFetchedInfo);
}

async function injectMetadata(filePath, metadata) {
    return new Promise((resolve) => {
        const ext = path.extname(filePath);
        const tempOut = filePath.replace(ext, `_tagged${ext}`);
        const ffmpegArgs = ['-y', '-i', filePath];
        
        if (metadata.coverFile && fs.existsSync(metadata.coverFile)) {
            ffmpegArgs.push('-i', metadata.coverFile);
        }

        const isVideo = ext === '.mp4';
        if (isVideo) {
            ffmpegArgs.push('-map', '0:v', '-map', '0:a');
        } else {
            ffmpegArgs.push('-map', '0:a');
        }

        if (metadata.coverFile && fs.existsSync(metadata.coverFile)) {
            ffmpegArgs.push('-map', '1:0', '-disposition:v:1', 'attached_pic');
        }

        if (metadata.title) ffmpegArgs.push('-metadata', `title=${metadata.title}`);
        if (metadata.artist) ffmpegArgs.push('-metadata', `artist=${metadata.artist}`);
        if (metadata.album) ffmpegArgs.push('-metadata', `album=${metadata.album}`);
        if (metadata.year && metadata.year !== 'Unknown') ffmpegArgs.push('-metadata', `date=${metadata.year}`);

        // CRITICAL: Use -c copy to avoid re-encoding. This fixes the "stuck" finalizing issue.
        ffmpegArgs.push('-c', 'copy', tempOut);
        
        console.log(`[FFmpeg] Finalizing with instant copy...`);
        const ff = spawn('ffmpeg', ffmpegArgs);
        ff.on('close', (code) => {
            const success = code === 0 && fs.existsSync(tempOut);
            
            if (success) {
                fs.renameSync(tempOut, filePath);
                return resolve(true);
            }

            if (fs.existsSync(tempOut)) {
                fs.unlinkSync(tempOut);
            }
            resolve(false);
        });
    });
}

async function downloadImageToBuffer(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    } catch (err) {
        throw new Error(`Download failed: ${err.message}`);
    }
}

module.exports = { 
    getVideoInfo, 
    spawnDownload, 
    streamDownload,
    downloadImage, 
    injectMetadata, 
    downloadImageToBuffer,
    cacheVideoInfo,
    acquireLock,
    releaseLock,
    COMMON_ARGS,
    CACHE_DIR
};