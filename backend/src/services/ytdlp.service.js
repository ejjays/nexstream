const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs').promises;
const { PassThrough } = require('node:stream');
const axios = require('axios');

const MAX_CONCURRENT_WEIGHT = 2;
let activeWeight = 0;
const processQueue = [];

function acquireLock(weight = 1) {
    return new Promise(resolve => {
        if (activeWeight + weight <= MAX_CONCURRENT_WEIGHT) {
            activeWeight += weight;
            resolve();
        } else {
            processQueue.push({ resolve, weight });
        }
    });
}

function releaseLock(weight = 1) {
    activeWeight -= weight;
    while (processQueue.length > 0 && (activeWeight + processQueue[0].weight <= MAX_CONCURRENT_WEIGHT)) {
        const next = processQueue.shift();
        activeWeight += next.weight;
        next.resolve();
    }
}

const COMMON_ARGS = [
    '--ignore-config', '--no-playlist', '--remote-components', 'ejs:github',
    '--force-ipv4', '--no-check-certificates', '--no-check-formats',
    '--no-warnings', '--socket-timeout', '30', '--retries', '3', '--no-colors',
];

const CACHE_DIR = path.join(__dirname, '../../temp/yt-dlp-cache');
const metadataCache = new Map();
const METADATA_EXPIRY = 7200000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

async function downloadImage(url, dest) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        await fsPromises.writeFile(dest, response.data);
        return dest;
    } catch (err) {
        if (fs.existsSync(dest)) await fsPromises.unlink(dest).catch(() => {});
        throw err;
    }
}

const { isSupportedUrl } = require('../utils/validation.util');

async function getVideoInfo(url, cookieArgs = [], forceRefresh = false, signal = null) {
    const cacheKey = `${url}_${cookieArgs.join('_')}`;
    const cached = metadataCache.get(cacheKey);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp < METADATA_EXPIRY)) return cached.data;
    if (!isSupportedUrl(url)) throw new Error('Unsupported or malicious URL');

    let targetUrl = url;
    if (url.includes('bili.im') || url.includes('facebook.com/share')) targetUrl = await expandShortUrl(url);

    await acquireLock(0.5);
    try {
        const info = await runYtdlpInfo(targetUrl, cookieArgs, signal);
        metadataCache.set(cacheKey, { data: info, timestamp: Date.now() });
        return info;
    } finally { releaseLock(0.5); }
}

async function expandShortUrl(url) {
    try {
        const parsed = new URL(url);
        const base = parsed.hostname === 'bili.im' ? 'https://bili.im' : 'https://www.facebook.com';
        const safePath = parsed.pathname.match(/^[a-zA-Z0-9\/\-_]+$/) ? parsed.pathname : '/';
        const safeSearch = parsed.search.match(/^[a-zA-Z0-9\?&=%\-_]+$/) ? parsed.search : '';
        const res = await axios.head(`${base}${safePath}${safeSearch}`, { maxRedirects: 5, headers: { 'User-Agent': USER_AGENT } });
        return res.request.res.responseUrl || url;
    } catch (e) { return url; }
}

function runYtdlpInfo(targetUrl, cookieArgs, signal = null) {
    return new Promise((resolve, reject) => {
        const refererMap = { 'facebook.com': 'https://www.facebook.com/', 'bilibili.com': 'https://www.bilibili.com/', 'x.com': 'https://x.com/' };
        const referer = Object.entries(refererMap).find(([domain]) => targetUrl.includes(domain))?.[1] || '';
        const args = [...cookieArgs, '--dump-json', '--user-agent', USER_AGENT, ...COMMON_ARGS, '--cache-dir', CACHE_DIR];
        if (referer) args.push('--referer', referer);
        if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
            args.push('--extractor-args', 'youtube:player_client=web_safari,android_vr,tv;player_skip=configs,webpage,js-variables');
        }
        args.push(targetUrl);

        const proc = spawn('yt-dlp', args);

        if (signal) {
            signal.addEventListener('abort', () => {
                if (proc.exitCode === null) {
                    console.log('[ytdlp] Process aborted by signal');
                    proc.kill('SIGKILL');
                }
                reject(new Error('Process Aborted'));
            });
        }

        let stdout = '', stderr = '';
        proc.stdout.on('data', (d) => { stdout += d; });
        proc.stderr.on('data', (d) => { stderr += d; });
        proc.on('close', (code) => {
            if (code !== 0) return reject(new Error(stderr));
            try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
        });
    });
}

function cacheVideoInfo(url, data, cookieArgs = []) {
    metadataCache.set(`${url}_${cookieArgs.join('_')}`, { data, timestamp: Date.now() });
}

function spawnDownload(url, options, cookieArgs = []) {
    const { format, formatId, tempFilePath } = options;
    const baseArgs = [...cookieArgs, '--user-agent', USER_AGENT, ...COMMON_ARGS, '--cache-dir', CACHE_DIR, '--newline', '--progress', '-o', tempFilePath];
    if (url.includes('youtube.com') || url.includes('youtu.be')) baseArgs.push('--extractor-args', 'youtube:player_client=web_safari,android_vr,tv');
    baseArgs.push(url);

    let args = [];
    if (['mp3', 'm4a', 'webm', 'audio'].includes(format)) {
        const fId = formatId || 'bestaudio[ext=m4a]/bestaudio';
        args = format !== 'mp3' ? ['-f', fId, ...baseArgs] : ['-f', fId, '--extract-audio', '--audio-format', 'mp3', ...baseArgs];
    } else {
        args = ['-f', formatId ? `${formatId}+bestaudio/best` : 'bestvideo+bestaudio/best', '-S', 'res,vcodec:vp9', '--merge-output-format', 'mp4', ...baseArgs];
    }
    return spawn('yt-dlp', args);
}

function getNetscapeCookieString(cookiesFile, targetUrl) {
    if (!cookiesFile || !fs.existsSync(cookiesFile)) return '';
    try {
        const domain = new URL(targetUrl).hostname.split('.').slice(-2).join('.');
        return fs.readFileSync(cookiesFile, 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes(domain)).map(l => { 
            const p = l.split('\t'); 
            return `${p[5]}=${p[6]}`; 
        }).join('; ');
    } catch { return ''; }
}

function handleMp3Stream(url, formatId, cookieArgs, preFetchedInfo) {
    const combinedStdout = new PassThrough(), eventBus = new (require('node:events'))();
    let ffmpegProcess = null;
    const proxy = { stdout: combinedStdout, kill: () => { if (ffmpegProcess?.exitCode === null) ffmpegProcess.kill('SIGKILL'); }, on: (event, cb) => event === 'close' ? eventBus.on('close', cb) : combinedStdout.on(event, cb), get exitCode() { return ffmpegProcess?.exitCode; } };

    (async () => {
        try {
            let info = preFetchedInfo;
            let audioFormat = info?.formats?.find(f => f.format_id === formatId && f.url);
            if (!audioFormat) {
                info = info || await getVideoInfo(url, cookieArgs);
                audioFormat = info.formats.find(f => f.format_id === formatId) || info.formats.filter(f => f.acodec !== 'none').sort((a,b) => (b.abr || 0) - (a.abr || 0))[0];
            }
            if (!audioFormat?.url) throw new Error('No audio URL');

            const referer = info?.http_headers?.['Referer'] || info?.webpage_url || '';
            const cookiesFile = cookieArgs.join(' ').includes('--cookies') ? cookieArgs[cookieArgs.indexOf('--cookies') + 1] : null;
            const cookieString = getNetscapeCookieString(cookiesFile, audioFormat.url);

            ffmpegProcess = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-user_agent', USER_AGENT, ...(referer ? ['-referer', referer] : []), ...(cookieString ? ['-cookies', cookieString] : []), '-i', audioFormat.url, '-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', 'pipe:1']);
            ffmpegProcess.stdout.pipe(combinedStdout);
            ffmpegProcess.on('close', (code) => eventBus.emit('close', code));
        } catch (err) { combinedStdout.emit('error', err); eventBus.emit('close', 1); }
    })();
    return proxy;
}

function handleDoublePipeStream(url, formatId, cookieArgs, combinedStdout, eventBus, proxy) {
    const ytdlpProc = spawn('yt-dlp', [...cookieArgs, '--user-agent', USER_AGENT, ...COMMON_ARGS, '--cache-dir', CACHE_DIR, '-f', formatId || 'best', '-o', '-', url]);
    const ffmpegProc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1']);
    ytdlpProc.stdout.on('data', (chunk) => { if (ffmpegProc.stdin.writable) ffmpegProc.stdin.write(chunk); });
    ytdlpProc.stdout.on('end', () => { if (ffmpegProc.stdin.writable) ffmpegProc.stdin.end(); });
    ffmpegProc.stdout.pipe(combinedStdout);
    ffmpegProc.on('close', (code) => eventBus.emit('close', code));
    proxy.kill = () => { if (ytdlpProc.exitCode === null) ytdlpProc.kill('SIGKILL'); if (ffmpegProc.exitCode === null) ffmpegProc.kill('SIGKILL'); };
}

const getBestAudioFormat = (formats) => {
    return formats.filter(f => f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')).sort((a, b) => {
        const aIsAac = a.acodec?.includes('aac'), bIsAac = b.acodec?.includes('aac');
        if (aIsAac && !bIsAac) return -1; 
        if (!aIsAac && bIsAac) return 1; 
        return (b.abr || 0) - (a.abr || 0);
    })[0] || { url: null };
};

const buildFfmpegInputs = (videoFormat, audioFormat, info, cookieArgs) => {
    const referer = info.http_headers?.['Referer'] || info.webpage_url || '';
    const cookiesFile = cookieArgs.join(' ').includes('--cookies') ? cookieArgs[cookieArgs.indexOf('--cookies') + 1] : null;
    const inputs = [];
    
    const addInput = (format) => {
        inputs.push('-user_agent', USER_AGENT);
        if (referer) inputs.push('-referer', referer);
        const cookies = getNetscapeCookieString(cookiesFile, format.url);
        if (cookies) inputs.push('-cookies', cookies);
        inputs.push('-i', format.url);
    };

    addInput(videoFormat);
    if (audioFormat.url) addInput(audioFormat);
    return inputs;
};

function handleVideoStream(url, formatId, cookieArgs, preFetchedInfo) {
    const combinedStdout = new PassThrough(), eventBus = new (require('node:events'))();
    let ffmpegProcess = null;
    const proxy = { stdout: combinedStdout, kill: () => { if (ffmpegProcess?.exitCode === null) ffmpegProcess.kill('SIGKILL'); }, on: (event, cb) => event === 'close' ? eventBus.on('close', cb) : combinedStdout.on(event, cb), get exitCode() { return ffmpegProcess?.exitCode; } };

    (async () => {
        try {
            const info = preFetchedInfo || await getVideoInfo(url, cookieArgs);
            const videoFormat = info.formats.find(f => f.format_id === formatId) || { url: null };
            if (!videoFormat.url) throw new Error('No video URL');

            const videoHasAudio = videoFormat.acodec && videoFormat.acodec !== 'none';
            const audioFormat = videoHasAudio ? { url: null } : getBestAudioFormat(info.formats);

            if (['tiktok.com', 'reddit.com'].some(d => url.includes(d)) && videoHasAudio && !audioFormat.url) {
                return handleDoublePipeStream(url, formatId, cookieArgs, combinedStdout, eventBus, proxy);
            }

            const ffmpegInputs = buildFfmpegInputs(videoFormat, audioFormat, info, cookieArgs);
            const audioMap = audioFormat.url ? ['-map', '1:a:0'] : (videoHasAudio ? ['-map', '0:a:0'] : ['-map', '0:a?']);
            const ffmpegArgs = ['-hide_banner', '-loglevel', 'error', ...ffmpegInputs, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-map', '0:v:0', ...audioMap, '-shortest', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1'];

            ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
            ffmpegProcess.stdout.pipe(combinedStdout);
            ffmpegProcess.on('close', (code) => eventBus.emit('close', code));
        } catch (err) { combinedStdout.emit('error', err); eventBus.emit('close', 1); }
    })();
    return proxy;
}

function streamDownload(url, options, cookieArgs = [], preFetchedInfo = null) {
    const { format, formatId } = options;
    const baseArgs = [...cookieArgs, '--user-agent', USER_AGENT, ...COMMON_ARGS, '--cache-dir', CACHE_DIR, '--newline', '--progress', '--progress-template', '[download] %(progress._percent_str)s', '--no-part'];
    if (url.includes('youtube.com') || url.includes('youtu.be')) baseArgs.push('--extractor-args', 'youtube:player_client=web_safari,android_vr,tv');
    baseArgs.push(url);

    if (format === 'mp3') return handleMp3Stream(url, formatId, cookieArgs, preFetchedInfo);
    if (['m4a', 'webm', 'audio', 'opus'].includes(format)) return spawn('yt-dlp', ['-f', formatId || 'bestaudio[ext=m4a]/bestaudio', '-o', '-', ...baseArgs]);
    return handleVideoStream(url, formatId, cookieArgs, preFetchedInfo);
}

async function injectMetadata(filePath, metadata) {
    return new Promise((resolve) => {
        const ext = path.extname(filePath), tempOut = filePath.replace(ext, `_tagged${ext}`), ffmpegArgs = ['-y', '-i', filePath];
        if (metadata.coverFile && fs.existsSync(metadata.coverFile)) ffmpegArgs.push('-i', metadata.coverFile);
        ffmpegArgs.push('-map', '0:v?', '-map', '0:a');
        if (metadata.coverFile && fs.existsSync(metadata.coverFile)) ffmpegArgs.push('-map', '1:0', '-disposition:v:1', 'attached_pic');
        ['title', 'artist', 'album'].forEach(k => { if (metadata[k]) ffmpegArgs.push('-metadata', `${k}=${metadata[k]}`); });
        if (metadata.year && metadata.year !== 'Unknown') ffmpegArgs.push('-metadata', `date=${metadata.year}`);
        ffmpegArgs.push('-c', 'copy', tempOut);
        const ff = spawn('ffmpeg', ffmpegArgs);
        ff.on('close', (code) => {
            if (code === 0 && fs.existsSync(tempOut)) { fs.renameSync(tempOut, filePath); return resolve(true); }
            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); resolve(false);
        });
    });
}

async function downloadImageToBuffer(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
}

module.exports = { getVideoInfo, spawnDownload, streamDownload, downloadImage, injectMetadata, downloadImageToBuffer, cacheVideoInfo, acquireLock, releaseLock, COMMON_ARGS, CACHE_DIR };
