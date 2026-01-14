const { spawn } = require('child_process');
const path = require('path');

const COMMON_ARGS = [
    '--ignore-config',
    '--no-playlist',
    '--extractor-args', 'youtube:player_client=tv,web,ios',
    '--js-runtimes', 'deno,node',
    '--force-ipv4',
    '--no-check-certificates',
    '--add-header', 'Accept-Language: en-US,en;q=0.9',
    '--add-header', 'Sec-Fetch-Mode: navigate',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

const CACHE_DIR = path.join(__dirname, '../../temp/yt-dlp-cache');

async function getVideoInfo(url, cookieArgs = []) {
    return new Promise((resolve, reject) => {
        const args = [
            ...cookieArgs,
            '--dump-json',
            ...COMMON_ARGS,
            '--remote-components', 'ejs:github',
            '--cache-dir', CACHE_DIR,
            url
        ];
        
        console.log(`[Execute Info] yt-dlp ${args.join(' ')}`);
        
        const infoProcess = spawn('yt-dlp', args);

        let infoData = '';
        let infoError = '';

        infoProcess.stdout.on('data', (data) => infoData += data.toString());
        infoProcess.stderr.on('data', (data) => infoError += data.toString());

        infoProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`[yt-dlp Info Error] ${infoError}`);
                return reject(new Error(infoError || `yt-dlp exited with code ${code}`));
            }
            try {
                resolve(JSON.parse(infoData));
            } catch (e) {
                reject(e);
            }
        });
    });
}

function spawnDownload(url, options, cookieArgs = []) {
    const { format, formatId, tempFilePath } = options;
    let args = [];

    // Removed /best fallback to ensure we get exactly what was requested or an error
    if (format === 'mp3') {
        args = [
            ...cookieArgs,
            '-f', formatId || 'bestaudio',
            '--extract-audio',
            '--audio-format', 'mp3',
            ...COMMON_ARGS,
            '--cache-dir', CACHE_DIR,
            '--newline',
            '--progress',
            '-o', tempFilePath,
            url
        ];
    } else {
        const fArg = formatId ? `${formatId}+bestaudio` : 'bestvideo+bestaudio';
        args = [
            ...cookieArgs,
            '-f', fArg,
            '-S', 'res,vcodec:vp9',
            '--merge-output-format', 'mp4',
            ...COMMON_ARGS,
            '--cache-dir', CACHE_DIR,
            '--newline',
            '--progress',
            '-o', tempFilePath,
            url
        ];
    }

    console.log(`[Execute Download] yt-dlp ${args.join(' ')}`);
    return spawn('yt-dlp', args);
}

module.exports = {
    getVideoInfo,
    spawnDownload
};
