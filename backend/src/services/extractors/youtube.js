const vm = require('node:vm');
const { Readable } = require('node:stream');
const fs = require('node:fs');

let youtube = null;

async function getCookieString() {
  try {
    const { downloadCookies } = require('../../utils/cookie.util');
    const cookiesPath = await downloadCookies('youtube');
    if (cookiesPath && fs.existsSync(cookiesPath)) {
      const content = fs.readFileSync(cookiesPath, 'utf-8');
      // convert netscape cookies
      return content.split('\n')
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
          const parts = line.split('\t');
          return `${parts[5]}=${parts[6]}`;
        }).join('; ');
    }
  } catch (e) {
    console.warn('[JS-YT] Could not load cookies for Innertube:', e.message);
  }
  return '';
}

async function getYoutubeInstance() {
  if (youtube) return youtube;
  const { Innertube, UniversalCache, Platform, Log } = await import('youtubei.js');
  
  // kill library noise
  Log.setLevel(Log.Level.NONE);
  
  const cookie = await getCookieString();
  if (cookie) console.log(`[JS-YT] Loaded cookies (${cookie.length} chars)`);

  // setup vm context
  Platform.shim.eval = (data, env) => {
    try {
      const code = data.code || data.output;
      // setup vm context
      const context = { 
        ...env, 
        console, 
        URL, 
        WebAssembly,
        Buffer,
        process: { env: {} },
        setTimeout,
        clearTimeout
      };
      return vm.runInNewContext(code, context);
    } catch (e) {
      if (e.message.includes('return')) {
         try {
           return vm.runInNewContext(`(function(){${data.code || data.output}})()`, { ...env, console });
         } catch (inner) {
           console.error('[JS-YT] Decipher VM IIFE Error:', inner.message);
         }
      }
      console.error('[JS-YT] Decipher VM Error:', e.message);
      return null;
    }
  };

  youtube = await Innertube.create({ 
    cache: new UniversalCache(false),
    generate_session_locally: true,
    cookie: cookie
  });

  // hide parser logs
  youtube.session.on('undici:error', () => {});
  youtube.session.on('undici:warning', () => {});
  
  return youtube;
}

function extractId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^?&"'>]+)/);
  return match ? match[1] : url.split('/').pop().split('?')[0];
}

async function getInfo(url) {
  const videoId = extractId(url);
  console.log(`[JS-YT] info: ${videoId}`);

  // prioritize yt-dlp
  try {
    const info = await getFallbackInfo(url);
    if (info && info.formats && info.formats.length > 0) {
      // fetch secondary info
      getYoutubeInstance().then(yt => yt.getInfo(videoId).then(vi => info.original_info = vi).catch(() => {})).catch(() => {});
      return info;
    }
  } catch (err) {
    console.warn(`[JS-YT] Primary yt-dlp extraction failed for ${videoId}:`, err.message);
  }

  // Fallback to Innertube
  console.log(`[JS-YT] Falling back to Innertube for ${videoId}...`);
  let videoInfo;
  let yt;
  try {
    yt = await getYoutubeInstance();
    videoInfo = await yt.getInfo(videoId);
  } catch (err) {
    throw new Error(`[JS-YT] Both yt-dlp and Innertube failed for ${videoId}: ${err.message}`);
  }

  const { basic_info: basic, streaming_data } = videoInfo;

  if (!streaming_data) {
    console.warn(`[JS-YT] No streaming data found for ${videoId}. Reason: ${videoInfo.playability_status?.reason}`);
    return await getFallbackInfo(url);
  }

  const formats = streaming_data?.formats || [];
  const adaptive = streaming_data?.adaptive_formats || [];
  const allFormats = [...formats, ...adaptive];
  
  console.log(`[JS-YT] Total formats found: ${allFormats.length}`);

  const supportedItags = [18, 22, 137, 248, 136, 247, 135, 244, 134, 243, 133, 242, 160, 278, 140, 249, 250, 251, 298, 299, 302, 303, 308, 315, 394, 395, 396, 397, 398, 399, 400, 401];

  const mappedFormats = (await Promise.all(
    allFormats
      .filter(f => supportedItags.includes(f.itag))
      .map(async f => {
        const isMuxed = f.has_video && f.has_audio;
        const isAudio = f.has_audio && !f.has_video;
        
        let formatUrl = f.url ? f.url.toString() : '';
        
        // decipher if missing
        if (!formatUrl && f.signature_cipher) {
           try { 
             const deciphered = await f.decipher(yt.session.player);
             formatUrl = deciphered ? deciphered.toString() : '';
           } catch(e) {
             console.error(`[JS-YT] Decipher failed for itag ${f.itag}:`, e.message);
           }
        }

        return {
          format_id: f.itag?.toString(),
          itag: f.itag,
          extension: f.mime_type?.split(';')[0]?.split('/')[1] || 'mp4',
          ext: f.mime_type?.split(';')[0]?.split('/')[1] || 'mp4',
          resolution: f.quality_label || (f.width ? `${f.height}p` : null) || (isAudio ? 'audio' : '360p'),
          vcodec: f.video_codec || (f.has_video ? 'yes' : 'none'),
          acodec: f.audio_codec || (f.has_audio ? 'yes' : 'none'),
          abr: f.audio_sample_rate ? parseInt(f.audio_sample_rate) / 1000 : 128,
          tbr: parseInt(f.bitrate) / 1000 || 0,
          filesize: parseInt(f.content_length) || 0,
          url: formatUrl,
          is_muxed: isMuxed,
          is_audio: isAudio,
          width: f.width,
          height: f.height
        };
      })
  )).filter(f => f.url);

  // If all supported formats failed to decipher, trigger fallback
  if (allFormats.length > 0 && mappedFormats.length === 0) {
    console.warn(`[JS-YT] All formats failed to decipher for ${videoId}. Falling back to yt-dlp...`);
    return await getFallbackInfo(url);
  }

  const author = basic.author || videoInfo.primary_info?.author?.name || "Unknown Author";
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
  const rawThumb = basic.thumbnail?.[0]?.url;
  const thumbnail = rawThumb ? `${backendUrl}/proxy?url=${encodeURIComponent(rawThumb)}` : null;

  return {
    id: videoId,
    extractor_key: 'youtube',
    is_js_info: true,
    title: basic.title,
    author: author,
    uploader: author,
    duration: basic.duration,
    view_count: basic.view_count,
    thumbnail: thumbnail,
    formats: mappedFormats,
    original_info: videoInfo
  };
}

async function getFallbackInfo(url) {
  try {
    const { spawn } = require('node:child_process');
    console.log(`[JS-YT] Fallback: Fetching info via yt-dlp for ${url}`);
    
    const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    return new Promise((resolve, reject) => {
      // Basic info dump
      const args = ['--dump-json', '--no-playlist', '--flat-playlist', '--user-agent', USER_AGENT, url];
      
      const proc = spawn('yt-dlp', args);
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);
      proc.on('close', code => {
        if (code !== 0) return reject(new Error(stderr || 'yt-dlp failed'));
        try {
          const info = JSON.parse(stdout);
          const formats = (info.formats || []).map(f => {
             const isAudio = f.vcodec === 'none' || (f.acodec !== 'none' && f.vcodec === 'none');
             const isMuxed = f.vcodec !== 'none' && f.acodec !== 'none';
             
             return {
               format_id: f.format_id,
               itag: parseInt(f.format_id),
               extension: f.ext,
               ext: f.ext,
               resolution: f.resolution || (f.vcodec !== 'none' ? `${f.height}p` : 'audio'),
               url: f.url,
               vcodec: f.vcodec,
               acodec: f.acodec,
               is_audio: isAudio,
               is_muxed: isMuxed,
               abr: f.abr,
               filesize: f.filesize || f.filesize_approx || 0,
               width: f.width,
               height: f.height
             };
          }).filter(f => f.url);
          
          resolve({
            id: info.id,
            extractor_key: 'youtube',
            is_js_info: true,
            title: info.title,
            author: info.uploader || info.channel,
            uploader: info.uploader || info.channel,
            duration: info.duration,
            view_count: info.view_count,
            thumbnail: info.thumbnail,
            formats: formats,
            _from_ytdlp: true
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  } catch (e) {
    console.error(`[JS-YT] Fallback critical failure:`, e.message);
    throw e;
  }
}

async function getStream(videoInfo, options = {}) {
  const { formatId } = options;
  const itagNum = parseInt(formatId);
  console.log(`[JS-YT] Stream requested: ${videoInfo.id} (itag: ${formatId || 'best-audio'})`);
  
  // priority 1: use existing deciphered url if available (yt-dlp provides these ready to go)
  let format = videoInfo.formats.find(f => String(f.format_id) === String(formatId));
  if (!format && !formatId) {
    format = videoInfo.formats.find(f => f.is_audio) || videoInfo.formats[0];
  }

  if (format?.url) {
    console.log(`[JS-YT] Piped stream via direct URL: itag ${format.itag}`);
    try {
      const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      const response = await fetch(format.url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.youtube.com/',
          'Range': 'bytes=0-'
        }
      });
      if (response.ok) return Readable.fromWeb(response.body);
      console.warn(`[JS-YT] Direct URL stream failed (HTTP ${response.status}). Falling back to library...`);
    } catch (e) {
      console.error(`[JS-YT] Direct URL error:`, e.message);
    }
  }

  // priority 2: use library download() if we have original_info
  if (videoInfo.original_info) {
    const downloadOptions = {
      quality: 'best',
      type: 'audio',
      format: 'mp4'
    };
    if (!isNaN(itagNum)) downloadOptions.itag = itagNum;

    console.log(`[JS-YT] Fetching via Innertube.download()...`);
    try {
      const webStream = await videoInfo.original_info.download(downloadOptions);
      return Readable.fromWeb(webStream);
    } catch (err) {
      console.error(`[JS-YT] Innertube.download failed:`, err.message);
    }
  }

  // last resort: try to find any working audio format and re-getInfo via yt-dlp
  if (!options._retried) {
     console.log(`[JS-YT] Critical failure, attempting emergency session refresh via yt-dlp...`);
     const freshInfo = await getFallbackInfo(`https://www.youtube.com/watch?v=${videoInfo.id}`);
     return getStream(freshInfo, { ...options, _retried: true });
  }
  
  throw new Error("Failed to secure a working audio stream after multiple attempts.");
}

module.exports = { getInfo, getStream };
