const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const COMMON_ARGS = [
    '--ignore-config',
    '--no-playlist',
    '--js-runtimes', 'node',
    '--force-ipv4',
    '--no-check-certificates',
    '--socket-timeout', '30',
    '--retries', '3',
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
        // web_creator is best for 'seeing' formats, tv is backup
        const clientArg = 'youtube:player_client=web_creator,tv';
        const args = [
            ...cookieArgs,
            '--dump-json',
            ...COMMON_ARGS,
            '--extractor-args', `${clientArg}`,
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            '--remote-components', 'ejs:npm',
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
    
    // CRITICAL OPTIMIZATION:
    // web_creator ALWAYS fails on Render without a PO Token, causing a 5-10s delay.
    // We skip it entirely and go straight to 'tv', which works instantly.
    const clientArg = 'youtube:player_client=tv';

    const baseArgs = [
        ...cookieArgs,
        ...COMMON_ARGS,
        '--extractor-args', `${clientArg}`,
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        '--cache-dir', CACHE_DIR,
        '--newline',
        '--progress',
        '-o', tempFilePath,
        url
    ];

    let args = [];
    if (format === 'mp3') {
        const fId = formatId ? `${formatId}/bestaudio/best` : 'bestaudio/best';
        // Optimization: Use --postprocessor-args to ensure fast copy if possible, 
        // though mp3 usually requires re-encoding. 
        args = ['-f', fId, '--extract-audio', '--audio-format', 'mp3', ...baseArgs];
    } else {
        const fArg = formatId ? `${formatId}+bestaudio/best` : 'bestvideo+bestaudio/best';
        // CRITICAL: Use --merge-output-format and ensure no re-encoding
        args = ['-f', fArg, '-S', 'res,vcodec:vp9', '--merge-output-format', 'mp4', ...baseArgs];
    }

    console.log(`[Execute Download] yt-dlp ${args.join(' ')}`);
    return spawn('yt-dlp', args);
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

module.exports = { getVideoInfo, spawnDownload, downloadImage, injectMetadata, downloadImageToBuffer };