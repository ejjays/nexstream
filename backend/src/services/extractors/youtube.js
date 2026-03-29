const vm = require('node:vm');

let youtube = null;

async function getYoutubeInstance() {
  if (youtube) return youtube;
  const { Innertube, UniversalCache, Platform } = await import('youtubei.js');
  
  Platform.shim.eval = async (data, env) => {
    const script = new vm.Script(`(function() { ${data.output} })()`);
    const context = vm.createContext({
      console, Math, String, Number, Array, Date, RegExp, Object,
      encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout
    });
    return script.runInContext(context, { timeout: 10000 });
  };

  youtube = await Innertube.create({ 
    cache: new UniversalCache(false),
    generate_session_locally: true 
  });
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
  
  // common itags supported by yt-dlp
  const supportedItags = [18, 22, 137, 248, 136, 247, 135, 244, 134, 243, 133, 242, 160, 278, 140, 249, 250, 251, 298, 299, 302, 303, 308, 315, 394, 395, 396, 397, 398, 399, 400, 401];

  const mappedFormats = allFormats
    .filter(f => supportedItags.includes(f.itag))
    .map(f => {
      const isMuxed = f.has_video && f.has_audio;
      const isAudio = f.has_audio && !f.has_video;
      
      let formatUrl = f.url ? f.url.toString() : '';
      if (!formatUrl && f.signature_cipher) {
         try { formatUrl = f.decipher(yt.session.player).toString(); } catch(e) {}
      }

      if (!formatUrl) {
         formatUrl = `https://www.youtube.com/watch?v=${videoId}&itag=${f.itag}`;
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
    });

  console.log(`[JS-YT] formats: ${mappedFormats.length}`);

  const author = basic.author || videoInfo.primary_info?.author?.name || "Unknown Author";
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
  const rawThumb = basic.thumbnail?.[0]?.url;
  const thumbnail = rawThumb ? `${backendUrl}/proxy?url=${encodeURIComponent(rawThumb)}` : null;

  return {
    id: videoId,
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
  const { formatId, type = 'video+audio' } = options;
  console.log(`[JS-YT] stream itag: ${formatId || 'best'}`);
  
  if (formatId) {
    return await videoInfo.original_info.download({
      itag: parseInt(formatId),
      format: 'mp4'
    });
  }

  return await videoInfo.original_info.download({
    type,
    quality: 'best',
    format: 'mp4'
  });
}

module.exports = { getInfo, getStream };
