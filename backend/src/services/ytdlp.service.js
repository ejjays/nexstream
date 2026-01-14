const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const COMMON_ARGS = [
    '--ignore-config',
    '--no-playlist',
    '--js-runtimes', 'deno',
    '--js-runtimes', 'node',
    '--force-ipv4',
    '--no-check-certificates',
    '--socket-timeout', '30',
    '--retries', '3',
    '--add-header', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    '--add-header', 'Accept-Language: en-US,en;q=0.5',
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
        // web_creator and tv are currently the best for high-res formats without tokens
        const clientArg = 'youtube:player_client=web_creator,tv';

        const args = [
            ...cookieArgs,
            '--dump-json',
            ...COMMON_ARGS,
            '--extractor-args', `${clientArg}`,
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
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
    // CRITICAL: Must match info fetching to find the same formats
    const clientArg = 'youtube:player_client=web_creator,tv';

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
        args = ['-f', fId, '--extract-audio', '--audio-format', 'mp3', ...baseArgs];
    } else {
        // For video, we use the specific formatId and ensure it merges with best audio
        const fArg = formatId ? `${formatId}+bestaudio/best` : 'bestvideo+bestaudio/best';
        args = [
            '-f', fArg,
            // If it's a high-res VP9/AV1 format, we need to merge correctly
            '--merge-output-format', 'mp4',
            ...baseArgs
        ];
    }

    console.log(`[Execute Download] yt-dlp ${args.join(' ')}`);
    return spawn('yt-dlp', args);
}

async function injectMetadata(filePath, metadata) {
    return new Promise((resolve) => {
        const ext = path.extname(filePath);
        const tempOut = filePath.replace(ext, `_tagged${ext}`);
        
        // Use separate map flags for video vs audio
        const isVideo = ext === '.mp4';
        const ffmpegArgs = ['-y', '-i', filePath];
        
        if (metadata.coverFile && fs.existsSync(metadata.coverFile)) {
            ffmpegArgs.push('-i', metadata.coverFile);
        }

        if (isVideo) {
            ffmpegArgs.push('-map', '0:v', '-map', '0:a');
        } else {
            ffmpegArgs.push('-map', '0:a');
        }

        if (metadata.coverFile && fs.existsSync(metadata.coverFile)) {
            const mapIdx = isVideo ? '2:0' : '1:0';
            ffmpegArgs.push('-map', mapIdx, '-disposition:v:0', 'attached_pic');
        }

        if (metadata.title) ffmpegArgs.push('-metadata', `title=${metadata.title}`);
        if (metadata.artist) ffmpegArgs.push('-metadata', `artist=${metadata.artist}`);
        if (metadata.album) ffmpegArgs.push('-metadata', `album=${metadata.album}`);
        if (metadata.year && metadata.year !== 'Unknown') ffmpegArgs.push('-metadata', `date=${metadata.year}`);

        ffmpegArgs.push('-c', 'copy', tempOut);
        
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

module.exports = { getVideoInfo, spawnDownload, downloadImage, injectMetadata };
