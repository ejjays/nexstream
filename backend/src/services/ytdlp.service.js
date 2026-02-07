const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { PassThrough } = require('stream');

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
const METADATA_EXPIRY = 5 * 60 * 1000; // 5 minutes

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

    return new Promise((resolve, reject) => {
        const clientArg = 'youtube:player_client=web_safari,android_vr,tv';
        const args = [
            ...cookieArgs,
            '--dump-json',
            ...COMMON_ARGS,
            '--extractor-args', `${clientArg}`,
            '--cache-dir', CACHE_DIR,
            url
        ];
        const infoProcess = spawn('yt-dlp', args);
        let infoData = '';
        let infoError = '';
        infoProcess.stdout.on('data', (data) => infoData += data.toString());
        infoProcess.stderr.on('data', (data) => infoError += data.toString());
        infoProcess.on('close', (code) => {
            if (code !== 0) return reject(new Error(infoError));
            try { 
                const parsed = JSON.parse(infoData);
                metadataCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
                resolve(parsed); 
            } catch (e) { reject(e); }
        });
    });
}

function spawnDownload(url, options, cookieArgs = [], preFetchedInfo = null) {
    const { format, formatId, tempFilePath } = options;
    
    // web_safari and android_vr are currently most reliable for high quality without PO Token.
    const clientArg = 'youtube:player_client=web_safari,android_vr,tv';

    const baseArgs = [
        ...cookieArgs,
        ...COMMON_ARGS,
        '--extractor-args', `${clientArg}`,
        '--cache-dir', CACHE_DIR,
        '--newline',
        '--progress',
        '-o', tempFilePath,
        url
    ];

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
    const clientArg = 'youtube:player_client=web_safari,android_vr,tv';

    const baseArgs = [
        ...cookieArgs,
        ...COMMON_ARGS,
        '--extractor-args', `${clientArg}`,
        '--cache-dir', CACHE_DIR,
        '--newline',
        '--progress',
        '--progress-template', '[download] %(progress._percent_str)s',
        '--no-part',
        url
    ];

    if (format === 'mp3' || format === 'm4a' || format === 'webm' || format === 'audio') {
        const fId = formatId || 'bestaudio[ext=m4a]/bestaudio';
        let args = ['-f', fId, '-o', '-', ...baseArgs];
        if (format === 'mp3') {
            args = ['-f', fId, '--extract-audio', '--audio-format', 'mp3', '-o', '-', ...baseArgs];
        }
        console.log(`[Execute Stream Audio] yt-dlp ${args.join(' ')}`);
        return spawn('yt-dlp', args);
    } else {
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
                
                // Find selected video and best audio
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

                const ffmpegInputs = ['-i', videoFormat.url];
                if (audioFormat.url) {
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

                console.log(`[Execute Direct Stream] ffmpeg ${ffmpegArgs.join(' ')}`);
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
            // Map the image input. For video, it becomes a second stream.
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
    COMMON_ARGS,
    CACHE_DIR
};