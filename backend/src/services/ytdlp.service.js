const { spawn } = require('child_process');
const path = require('path');

const COMMON_ARGS = [
    '--ignore-config',
    '--no-playlist',
    '--js-runtimes', 'deno',
    '--js-runtimes', 'node',
    '--force-ipv4',
    '--no-check-certificates',
    '--socket-timeout', '30',
    '--retries', '3',
    '--add-header', 'Accept-Language: en-US,en;q=0.9',
    '--add-header', 'Referer: https://www.google.com/',
    '--add-header', 'Origin: https://www.youtube.com',
];

const CACHE_DIR = path.join(__dirname, '../../temp/yt-dlp-cache');

async function getVideoInfo(url, cookieArgs = []) {
    return new Promise((resolve, reject) => {
        // web,tv is the most reliable combo for metadata + 4K links
        const clientArg = 'youtube:player_client=web,tv';

        const args = [
            ...cookieArgs,
            '--dump-json',
            ...COMMON_ARGS,
            '--extractor-args', `${clientArg};player_skip=ios,android,web_safari`,
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
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
            try { resolve(JSON.parse(infoData)); } catch (e) { reject(e); }
        });
    });
}

function spawnDownload(url, options, cookieArgs = []) {
    const { format, formatId, tempFilePath } = options;
    
    // For downloads, we use web,tv to ensure high-res availability
    const clientArg = 'youtube:player_client=web,tv';

    const baseArgs = [
        ...cookieArgs,
        ...COMMON_ARGS,
        '--extractor-args', `${clientArg};player_skip=ios,android,web_safari`,
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        '--cache-dir', CACHE_DIR,
        '--newline',
        '--progress',
        '-o', tempFilePath,
        url
    ];

    let args = [];
    if (format === 'mp3') {
        args = [
            '-f', formatId || 'bestaudio/best',
            '--extract-audio',
            '--audio-format', 'mp3',
            ...baseArgs
        ];
    } else {
        const fArg = formatId ? `${formatId}+bestaudio/best` : 'bestvideo+bestaudio/best';
        args = [
            '-f', fArg,
            '-S', 'res,vcodec:vp9',
            '--merge-output-format', 'mp4',
            ...baseArgs
        ];
    }

    console.log(`[Execute Download] yt-dlp ${args.join(' ')}`);
    return spawn('yt-dlp', args);
}

module.exports = { getVideoInfo, spawnDownload };