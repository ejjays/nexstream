const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

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

async function getVideoInfo(url, cookieArgs = []) {
    return new Promise((resolve, reject) => {
        // web_safari and android_vr are currently most reliable for high quality without PO Token.
        // we put web_safari first because it supports cookies, preventing warnings.
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
            try { resolve(JSON.parse(infoData)); } catch (e) { reject(e); }
        });
    });
}

function spawnDownload(url, options, cookieArgs = []) {
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
        // ELITE AUDIO PIPELINE: Always prioritize Direct Copy if possible
        // If a specific formatId is provided, we use it directly.
        const fId = formatId || 'bestaudio[ext=m4a]/bestaudio';
        
        // If format is 'audio', 'm4a', or 'webm', we do a direct stream copy (Zero Loss)
        // If format is 'mp3', we only convert if the source isn't already compatible.
        if (format !== 'mp3') {
            args = ['-f', fId, ...baseArgs];
        } else {
            // Traditional MP3 extraction (re-encoding) - only as legacy fallback
            args = ['-f', fId, '--extract-audio', '--audio-format', 'mp3', ...baseArgs];
        }
    } else {
        const fArg = formatId ? `${formatId}+bestaudio/best` : 'bestvideo+bestaudio/best';
        // CRITICAL: Use --merge-output-format and ensure no re-encoding
        args = ['-f', fArg, '-S', 'res,vcodec:vp9', '--merge-output-format', 'mp4', ...baseArgs];
    }

    console.log(`[Execute Download] yt-dlp ${args.join(' ')}`);
    return spawn('yt-dlp', args);
}

/**
 * ELITE STREAMING PIPELINE
 * Pipes yt-dlp output directly to stdout for real-time streaming to the client.
 */
function streamDownload(url, options, cookieArgs = []) {
    const { format, formatId } = options;
    const clientArg = 'youtube:player_client=web_safari,android_vr,tv';

    const baseArgs = [
        ...cookieArgs,
        ...COMMON_ARGS,
        '--extractor-args', `${clientArg}`,
        '--cache-dir', CACHE_DIR,
        '--no-part',
        '-o', '-', // Output to stdout
        url
    ];

    if (format === 'mp3' || format === 'm4a' || format === 'webm' || format === 'audio') {
        const fId = formatId || 'bestaudio[ext=m4a]/bestaudio';
        let args = [];
        if (format === 'mp3') {
            args = ['-f', fId, '--extract-audio', '--audio-format', 'mp3', ...baseArgs];
        } else {
            args = ['-f', fId, ...baseArgs];
        }
        console.log(`[Execute Stream Audio] yt-dlp ${args.join(' ')}`);
        return spawn('yt-dlp', args);
    } else {
        const fArg = formatId ? `${formatId}+bestaudio/best` : 'bestvideo+bestaudio/best';
        
        // ELITE VIDEO STREAMING: Use ffmpeg to mux into a Fragmented MP4
        // This makes the stream compatible with phone galleries.
        const ytdlpArgs = ['-f', fArg, ...baseArgs];
        const ffmpegArgs = [
            '-i', 'pipe:0',             // Read from yt-dlp stdout
            '-c', 'copy',               // Don't re-encode (keep it fast!)
            '-f', 'mp4',                // Force MP4 container
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof', // Streaming friendly flags
            'pipe:1'                    // Output to stdout (the response)
        ];

        console.log(`[Execute Stream Video] yt-dlp ${ytdlpArgs.join(' ')} | ffmpeg ${ffmpegArgs.join(' ')}`);
        
        const ytdlpProcess = spawn('yt-dlp', ytdlpArgs);
        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

        // Pipe yt-dlp output into ffmpeg input
        ytdlpProcess.stdout.pipe(ffmpegProcess.stdin);

        // Handle errors to prevent hanging
        ytdlpProcess.stderr.on('data', (data) => {
            // Forward yt-dlp progress/errors to the same place for the controller to read
            ffmpegProcess.stderr.write(data);
        });

        // Return the ffmpeg process because its stdout is what we want to send to the user
        return ffmpegProcess;
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