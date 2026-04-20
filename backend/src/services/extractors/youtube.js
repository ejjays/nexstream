const vm = require('node:vm');
const { Readable } = require('node:stream');
const fs = require('node:fs');

let youtube = null;

// get raw cookies
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

  // init decipher vm
  Platform.shim.eval = async (data, env) => {
    try {
      const script = new vm.Script(`(function() { ${data.output} })()`);
      const context = vm.createContext({
        console, Math, String, Number, Array, Date, RegExp, Object,
        Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
        Float32Array, Float64Array, ArrayBuffer, DataView,
        Buffer, 
        URL, URLSearchParams,
        encodeURIComponent, decodeURIComponent, 
        setTimeout, clearTimeout,
        self: {},
        window: {}
      });
      return script.runInContext(context, { timeout: 10000 });
    } catch (e) {
      console.error('[JS-YT] Decipher VM Critical Error:', e.message);
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
  const yt = await getYoutubeInstance();
  const videoId = extractId(url);
  
  console.log(`[JS-YT] info: ${videoId}`);
  const videoInfo = await yt.getInfo(videoId);
  const { basic_info: basic, streaming_data } = videoInfo;

  const formats = streaming_data?.formats || [];
  const adaptive = streaming_data?.adaptive_formats || [];
  const allFormats = [...formats, ...adaptive];
  
  const supportedItags = [18, 22, 137, 248, 136, 247, 135, 244, 134, 243, 133, 242, 160, 278, 140, 249, 250, 251, 298, 299, 302, 303, 308, 315, 394, 395, 396, 397, 398, 399, 400, 401];

  const mappedFormats = await Promise.all(
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
           } catch(e) {}
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
  );

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

async function getStream(videoInfo, options = {}) {
  const { formatId } = options;
  console.log(`[JS-YT] Stream requested: ${videoInfo.id} (itag: ${formatId})`);
  // find best format
  const format = videoInfo.formats.find(f => String(f.format_id) === String(formatId)) || 
                 videoInfo.formats.find(f => f.is_audio) ||
                 videoInfo.formats[0];

  if (format && format.url) {
    console.log(`[JS-YT] Piped stream via direct URL: itag ${format.itag}`);
    try {
      const yt = await getYoutubeInstance();
      const response = await fetch(format.url, {
        headers: {
          'User-Agent': yt.session.context.client.userAgent,
          'Referer': 'https://www.youtube.com/'
        }
      });
      if (response.ok) return Readable.fromWeb(response.body);
    } catch (e) {}
  }

  // pure js stream
  const downloadOptions = {
    quality: 'best',
    type: 'audio',
    format: 'mp4'
  };

  const itagNum = parseInt(formatId);
  if (!isNaN(itagNum)) downloadOptions.itag = itagNum;

  console.log(`[JS-YT] Fetching via Innertube.download()...`);
  const webStream = await videoInfo.original_info.download(downloadOptions);

  return Readable.fromWeb(webStream);
}

module.exports = { getInfo, getStream };
