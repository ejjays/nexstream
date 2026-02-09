const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { PassThrough } = require('stream');

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
const METADATA_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours

async function downloadImage(url, dest) {
    return new Promise((resolve, reject) => {
        const request = (targetUrl) => {
            https.get(targetUrl, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    return request(response.headers.location);
                }
                if (response.statusCode !== 200) return reject(new Error(`Status: ${response.statusCode}`));
                const file = fs.createWriteStream(dest);
                response.pipe(file);
                file.on('finish', () => { file.close(); resolve(dest); });
            }).on('error', (err) => { if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(err); });
        };
        request(url);
    });
}

async function getVideoInfo(url, cookieArgs = [], forceRefresh = false) {
    const cacheKey = `${url}_${cookieArgs.join('_')}`;
    
    if (!forceRefresh && metadataCache.has(cacheKey)) {
        const cached = metadataCache.get(cacheKey);
        if (Date.now() - cached.timestamp < METADATA_EXPIRY) {
            console.log(`[Cache] Returning cached metadata for: ${url}`);
            return cached.data;
        }
    }

    await acquireLock();
    return new Promise((resolve, reject) => {
        const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
        
        let referer = '';
        if (url.includes('facebook.com')) referer = 'https://www.facebook.com/';
        else if (url.includes('bilibili.com') || url.includes('bili.im')) referer = 'https://www.bilibili.com/';
        else if (url.includes('twitter.com') || url.includes('x.com')) referer = 'https://x.com/';
        
        const args = [
            ...cookieArgs,
            '--dump-json',
            '--user-agent', userAgent,
            ...COMMON_ARGS,
            '--cache-dir', CACHE_DIR,
        ];

        if (referer) {
            args.push('--referer', referer);
        }

        // Only apply YouTube-specific hacks if it's actually YouTube
        if (isYoutube) {
            const clientArg = 'youtube:player_client=web_safari,android_vr,tv';
            args.push('--extractor-args', clientArg);
        }

        args.push(url);

        const infoProcess = spawn('yt-dlp', args);
        let infoData = '';
        let infoError = '';
        infoProcess.stdout.on('data', (data) => infoData += data.toString());
        infoProcess.stderr.on('data', (data) => infoError += data.toString());
        infoProcess.on('close', (code) => {
            releaseLock();
            if (code !== 0) return reject(new Error(infoError));
            try { 
                const parsed = JSON.parse(infoData);
                metadataCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
                resolve(parsed); 
            } catch (e) { reject(e); }
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

    console.log(`[Execute Download] yt-dlp ${args.join(' ')}`);
    return spawn('yt-dlp', args);
}

/**
 * ELITE STREAMING PIPELINE
 * Pipes yt-dlp output directly to stdout for real-time streaming to the client.
 */
function streamDownload(url, options, cookieArgs = [], preFetchedInfo = null) {
    const { format, formatId } = options;
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

    const baseArgs = [
        ...cookieArgs,
        '--user-agent', userAgent,
        ...COMMON_ARGS,
        '--cache-dir', CACHE_DIR,
        '--newline',
        '--progress',
        '--progress-template', '[download] %(progress._percent_str)s',
        '--no-part',
    ];

    if (isYoutube) {
        const clientArg = 'youtube:player_client=web_safari,android_vr,tv';
        baseArgs.push('--extractor-args', clientArg);
    }

    baseArgs.push(url);

    // HYBRID ENGINE:
    // 1. MP3 -> Direct FFmpeg Transcode (Instant Start ~0.4s, High Compatibility)
    // 2. M4A/WebM -> yt-dlp Standard Stream (Slower Start ~5s, Valid Container Structure)
    if (format === 'mp3') {
        const combinedStderr = new PassThrough();
        const combinedStdout = new PassThrough();
        
        let ffmpegProcess = null;
        const EventEmitter = require('events');
        const eventBus = new EventEmitter();

        const proxy = {
            stdout: combinedStdout,
            stderr: combinedStderr,
            kill: () => {
                if (ffmpegProcess && ffmpegProcess.exitCode === null) ffmpegProcess.kill('SIGKILL');
            },
            on: (event, cb) => {
                if (event === 'close') {
                    eventBus.on('close', cb);
                } else {
                    combinedStdout.on(event, cb);
                }
            },
            get exitCode() { 
                return ffmpegProcess ? ffmpegProcess.exitCode : null; 
            }
        };

        (async () => {
            try {
                let info = preFetchedInfo;
                if (!info) {
                    console.log(`[Stream] Metadata not provided, fetching...`);
                    info = await getVideoInfo(url, cookieArgs);
                } else {
                    console.log(`[Stream] Using pre-fetched metadata.`);
                }

                const audioFormat = info.formats.find(f => f.format_id === formatId) || 
                                  info.formats.filter(f => f.acodec !== 'none').sort((a,b) => (b.abr || 0) - (a.abr || 0))[0];
                
                if (!audioFormat || !audioFormat.url) throw new Error('Could not find audio URL');

                const userAgent = info.http_headers?.['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
                const referer = info.http_headers?.['Referer'] || info.webpage_url || '';
                
                // Smart Cookie Filter: Only send cookies if they match the target domain
                const cookiesFile = cookieArgs.join(' ').includes('--cookies') ? cookieArgs[cookieArgs.indexOf('--cookies') + 1] : null;
                let cookieString = '';
                if (cookiesFile && fs.existsSync(cookiesFile)) {
                    const domain = new URL(audioFormat.url).hostname.split('.').slice(-2).join('.');
                    cookieString = fs.readFileSync(cookiesFile, 'utf8').split('\n')
                        .filter(l => l && !l.startsWith('#') && l.includes(domain))
                        .map(l => { const p = l.split('\t'); return `${p[5]}=${p[6]}`; })
                        .join('; ');
                }

                const ffmpegArgs = [
                    '-hide_banner',
                    '-loglevel', 'error',
                    '-user_agent', userAgent,
                    ...(referer ? ['-referer', referer] : []),
                    ...(cookieString ? ['-cookies', cookieString] : []),
                    '-fflags', 'nobuffer',
                    '-flags', 'low_delay',
                    '-i', audioFormat.url,
                    '-c:a', 'libmp3lame',
                    '-b:a', '128k',
                    '-f', 'mp3',
                    'pipe:1'
                ];

                console.log(`[Execute Direct MP3 Stream] ffmpeg ${ffmpegArgs.join(' ')}`);
                ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

                ffmpegProcess.stdout.pipe(combinedStdout);
                
                ffmpegProcess.stderr.on('data', (d) => {
                    // console.log(`[FFmpeg] ${d.toString()}`);
                });

                ffmpegProcess.on('close', (code) => {
                    console.log(`[FFmpeg] Process closed with code ${code}`);
                    eventBus.emit('close', code);
                });

            } catch (err) {
                console.error('[Stream Error]', err.message);
                combinedStdout.emit('error', err);
                eventBus.emit('close', 1);
            }
        })();

        return proxy;
    } else if (format === 'm4a' || format === 'webm' || format === 'audio' || format === 'opus') {
        // Fallback to yt-dlp for other audio formats to ensure Moov atoms are correct for Android
        const fId = formatId || 'bestaudio[ext=m4a]/bestaudio';
        let args = ['-f', fId, '-o', '-', ...baseArgs];
        console.log(`[Execute Stream Audio] yt-dlp ${args.join(' ')}`);
        return spawn('yt-dlp', args);
    } else {
        // ELITE VIDEO STREAMING: Direct-URL Muxing Strategy
        const combinedStderr = new PassThrough();
        const combinedStdout = new PassThrough();
        
        let ffmpegProcess = null;
        const EventEmitter = require('events');
        const eventBus = new EventEmitter();

        const proxy = {
            stdout: combinedStdout,
            stderr: combinedStderr,
            kill: () => {
                if (ffmpegProcess && ffmpegProcess.exitCode === null) ffmpegProcess.kill('SIGKILL');
            },
            on: (event, cb) => {
                if (event === 'close') {
                    eventBus.on('close', cb);
                } else {
                    combinedStdout.on(event, cb);
                }
            },
            get exitCode() { 
                return ffmpegProcess ? ffmpegProcess.exitCode : null; 
            }
        };

        (async () => {
            try {
                let info = preFetchedInfo;
                if (!info) {
                    console.log(`[Stream] Metadata not provided, fetching...`);
                    info = await getVideoInfo(url, cookieArgs);
                } else {
                    console.log(`[Stream] Using pre-fetched metadata.`);
                }

                const videoFormat = info.formats.find(f => f.format_id === formatId) || { url: null };
                const audioFormat = info.formats
                    .filter(f => f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
                    .sort((a, b) => {
                        const aIsAac = a.acodec && a.acodec.includes('aac');
                        const bIsAac = b.acodec && b.acodec.includes('aac');
                        if (aIsAac && !bIsAac) return -1;
                        if (!aIsAac && bIsAac) return 1;
                        return (b.abr || 0) - (a.abr || 0);
                    })[0] || { url: null };

                if (!videoFormat.url) throw new Error('Could not find video URL');

                const userAgent = info.http_headers?.['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
                const referer = info.http_headers?.['Referer'] || info.webpage_url || '';
                const cookiesFile = cookieArgs.join(' ').includes('--cookies') ? cookieArgs[cookieArgs.indexOf('--cookies') + 1] : null;
                
                const getCookieString = (targetUrl) => {
                    if (!cookiesFile || !fs.existsSync(cookiesFile)) return '';
                    const domain = new URL(targetUrl).hostname.split('.').slice(-2).join('.');
                    return fs.readFileSync(cookiesFile, 'utf8').split('\n')
                        .filter(l => l && !l.startsWith('#') && l.includes(domain))
                        .map(l => { const p = l.split('\t'); return `${p[5]}=${p[6]}`; })
                        .join('; ');
                };

                const videoCookies = getCookieString(videoFormat.url);
                const ffmpegInputs = ['-user_agent', userAgent];
                if (referer) ffmpegInputs.push('-referer', referer);
                if (videoCookies) ffmpegInputs.push('-cookies', videoCookies);
                ffmpegInputs.push('-i', videoFormat.url);

                if (audioFormat.url) {
                    const audioCookies = getCookieString(audioFormat.url);
                    ffmpegInputs.push('-user_agent', userAgent);
                    if (referer) ffmpegInputs.push('-referer', referer);
                    if (audioCookies) ffmpegInputs.push('-cookies', audioCookies);
                    ffmpegInputs.push('-i', audioFormat.url);
                }

                const isAac = audioFormat.acodec && audioFormat.acodec.includes('aac');
                const ffmpegArgs = [
                    ...ffmpegInputs,
                    '-c', 'copy',
                    ...(isAac ? ['-bsf:a', 'aac_adtstoasc'] : []),
                    '-map', '0:v:0',
                    ...(audioFormat.url ? ['-map', '1:a:0'] : ['-map', '0:a:0']),
                    '-shortest',
                    '-f', 'mp4',
                    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
                    'pipe:1'
                ];

                console.log(`[Execute Direct Video Stream] ffmpeg ${ffmpegArgs.join(' ')}`);
                ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

                ffmpegProcess.stdout.pipe(combinedStdout);
                
                ffmpegProcess.stderr.on('data', (d) => {
                    const out = d.toString();
                    if (out.toLowerCase().includes('error')) console.error(`[FFmpeg] ${out}`);
                });

                ffmpegProcess.on('close', (code) => {
                    console.log(`[FFmpeg] Process closed with code ${code}`);
                    eventBus.emit('close', code);
                });

            } catch (err) {
                console.error('[Stream Error]', err.message);
                combinedStdout.emit('error', err);
                eventBus.emit('close', 1);
            }
        })();

        return proxy;
    }
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
            if (code === 0 && fs.existsSync(tempOut)) {
                fs.renameSync(tempOut, filePath);
                resolve(true);
            } else {
                if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
                resolve(false);
            }
        });
    });
}

async function downloadImageToBuffer(url) {
    return new Promise((resolve, reject) => {
        const request = (targetUrl) => {
            https.get(targetUrl, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    return request(response.headers.location);
                }
                if (response.statusCode !== 200) return reject(new Error(`Status: ${response.statusCode}`));
                
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => resolve(Buffer.concat(chunks)));
                response.on('error', (err) => reject(err));
            }).on('error', (err) => reject(err));
        };
        request(url);
    });
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