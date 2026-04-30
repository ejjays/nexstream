import vm from 'node:vm';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import { downloadCookies } from '../../utils/cookie.util.js';
import { VideoInfo, Format, ExtractorOptions } from '../../types/index.js';

let youtube: any = null;
let Innertube: any, UniversalCache: any, Platform: any, Log: any;

async function getCookieString(): Promise<string> {
  try {
    const cookiesPath = await downloadCookies('youtube');
    if (cookiesPath && fs.existsSync(cookiesPath)) {
      const content = fs.readFileSync(cookiesPath, 'utf-8');
      return content.split('\n')
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
          const parts = line.split('\t');
          if (parts.length < 7) return null;
          return `${parts[5]}=${parts[6]}`;
        }).filter(Boolean).join('; ');
    }
  } catch (e: unknown) {
  const error = e as Error;
  console.warn('[JS-YT] Could not load cookies for Innertube:', error.message);
  }

  return '';
}

async function getYoutubeInstance(): Promise<any> {
  if (youtube) return youtube;
  
  if (!Innertube) {
    const module = await import('youtubei.js');
    Innertube = module.Innertube;
    UniversalCache = module.UniversalCache;
    Platform = module.Platform;
    Log = module.Log;
  }
  
  Log.setLevel(Log.Level.NONE);
  const cookie = await getCookieString();

  Platform.shim.eval = (data: any, env: any) => {
    try {
      const code = data.code || data.output;
      const context = { 
        ...env, 
        console, URL, WebAssembly, Buffer,
        process: { env: {} },
        setTimeout, clearTimeout
      };
      return vm.runInNewContext(code, context);
    } catch (e: any) {
      if (e.message.includes('return')) {
         try {
           return vm.runInNewContext(`(function(){${data.code || data.output}})()`, { ...env, console });
         } catch (inner: any) {
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

  youtube.session.on('undici:error', () => {});
  youtube.session.on('undici:warning', () => {});
  
  return youtube;
}

function extractId(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^?&"'>]+)/);
  return match ? match[1] : url.split('/').pop()!.split('?')[0];
}

export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo> {
  const videoId = extractId(url);
  console.log(`[JS-YT] info: ${videoId}`);

  let videoInfo: any;
  let yt: any;
  try {
    yt = await getYoutubeInstance();
    videoInfo = await yt.getInfo(videoId);
  } catch (err: unknown) {
    const error = err as Error;
    console.warn(`[JS-YT] Innertube failed for ${videoId}, trying yt-dlp fallback:`, error.message);
    return await getFallbackInfo(url);
  }

  const { basic_info: basic, streaming_data } = videoInfo;

  if (!streaming_data) {
    console.warn(`[JS-YT] No streaming data found for ${videoId}. Falling back to yt-dlp...`);
    return await getFallbackInfo(url);
  }

  const formats = streaming_data?.formats || [];
  const adaptive = streaming_data?.adaptive_formats || [];
  const allFormats = [...formats, ...adaptive];
  
  console.log(`[JS-YT] Total formats found: ${allFormats.length}`);

  const mappedFormats: Format[] = (await Promise.all(
    allFormats.map(async f => {
        const isMuxed = f.has_video && f.has_audio;
        const isAudio = f.has_audio && !f.has_video;
        
        let formatUrl = (f.url || f.signatureCipher || f.signature_cipher) ? (f.url || '').toString() : '';
        const cipher = f.signatureCipher || f.signature_cipher;
        
        if (!formatUrl && cipher) {
           try { 
             const player = yt.session.player || await yt.getInfo(videoId).then((res: any) => yt.session.player);
             if (f.decipher && player) {
               formatUrl = (await f.decipher(player)).toString();
             } else if (cipher && player) {
               const params = new URLSearchParams(cipher);
               const s = params.get('s') || params.get('sig');
               const urlPart = params.get('url');
               const sp = params.get('sp') || 'sig';
               if (urlPart && s) {
                 const sig = await player.decipher(s);
                 const uri = new URL(urlPart);
                 uri.searchParams.set(sp, sig);
                 formatUrl = uri.toString();
               }
             }
           } catch(e: any) {
             console.error(`[JS-YT] Decipher failed for itag ${f.itag}:`, e.message);
           }
        }

        if (!formatUrl) formatUrl = `PENDING_DECIPHER_${f.itag}`;

        let resolution = f.quality_label || f.qualityLabel || f.quality;
        if (!resolution && f.width) {
          resolution = `${f.height}p`;
          if (f.fps && f.fps > 30) resolution += f.fps;
        }
        if (!resolution || resolution === 'tiny' || resolution === 'small') resolution = isAudio ? 'audio' : '360p';
        if (resolution === 'medium') resolution = '360p';
        if (resolution === 'large') resolution = '480p';
        if (resolution.includes('hd720')) resolution = '720p';
        if (resolution.includes('hd1080')) resolution = '1080p';
        if (resolution.includes('hd1440')) resolution = '1440p';
        if (resolution.includes('hd2160')) resolution = '2160p';
        if (resolution.includes('highres')) resolution = '4K';

        return {
          format_id: f.itag?.toString(),
          itag: f.itag,
          extension: (f.mime_type || f.mimeType)?.split(';')[0]?.split('/')[1] || 'mp4',
          ext: (f.mime_type || f.mimeType)?.split(';')[0]?.split('/')[1] || 'mp4',
          resolution: resolution,
          vcodec: f.video_codec || f.videoCodec || (f.has_video ? 'yes' : 'none'),
          acodec: f.audio_codec || f.audioCodec || (f.has_audio ? 'yes' : 'none'),
          abr: (f.audio_sample_rate || f.audioSampleRate) ? parseInt(f.audio_sample_rate || f.audioSampleRate) / 1000 : 128,
          tbr: parseInt(f.bitrate) / 1000 || 0,
          filesize: parseInt(f.content_length || f.contentLength) || 0,
          url: formatUrl,
          is_muxed: isMuxed,
          is_audio: isAudio,
          width: f.width,
          height: f.height,
          fps: f.fps
        };
      })
  )).filter(f => f.url);

  const author = basic.author || videoInfo.primary_info?.author?.name || "Unknown Author";
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
  const rawThumb = basic.thumbnail?.[0]?.url;
  const thumbnail = rawThumb ? `${backendUrl}/proxy?url=${encodeURIComponent(rawThumb)}` : '';

  return {
    id: videoId,
    title: basic.title,
    uploader: author,
    author: author,
    thumbnail: thumbnail,
    webpage_url: url,
    duration: basic.duration,
    formats: mappedFormats,
    extractor_key: 'youtube',
    is_js_info: true
  };
}

export async function getFallbackInfo(url: string): Promise<VideoInfo> {
  try {
    const { spawn } = await import('node:child_process');
    console.log(`[JS-YT] Fallback: Fetching info via yt-dlp for ${url}`);
    
    const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    return new Promise((resolve, reject) => {
      const args = ['--dump-json', '--no-playlist', '--flat-playlist', '--user-agent', USER_AGENT, url];
      const proc = spawn('yt-dlp', args);
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);
      proc.on('close', (code: number) => {
        if (code !== 0) return reject(new Error(stderr || 'yt-dlp failed'));
        try {
          const info = JSON.parse(stdout);
          const formats: Format[] = (info.formats || []).map((f: any) => {
             const isAudio = f.vcodec === 'none' || (f.acodec !== 'none' && f.vcodec === 'none');
             const isMuxed = f.vcodec !== 'none' && f.acodec !== 'none';
             return {
               format_id: f.format_id,
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
          }).filter((f: any) => f.url);
          
          resolve({
            id: info.id,
            title: info.title,
            uploader: info.uploader || info.channel,
            author: info.uploader || info.channel,
            thumbnail: info.thumbnail,
            webpage_url: url,
            duration: info.duration,
            formats: formats,
            extractor_key: 'youtube',
            is_js_info: true
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  } catch (e: any) {
    console.error(`[JS-YT] Fallback critical failure:`, e.message);
    throw e;
  }
}

export async function getStream(videoInfo: VideoInfo, options: ExtractorOptions & { _retried?: boolean } = {}): Promise<Readable> {
  const { formatId } = options;
  const itagNum = formatId ? parseInt(formatId) : NaN;
  console.log(`[JS-YT] Stream requested: ${videoInfo.id} (itag: ${formatId || 'best-audio'})`);
  
  let format = videoInfo.formats.find((f) => String(f.format_id) === String(formatId));
  if (!format && !formatId) {
    format = videoInfo.formats.find((f) => f.is_audio) || videoInfo.formats[0];
  }

  if (format?.url && !format.url.startsWith('PENDING')) {
    console.log(`[JS-YT] Piped stream via direct URL: itag ${formatId}`);
    try {
      const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      const response = await fetch(format.url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.youtube.com/',
          'Range': 'bytes=0-'
        }
      });
      if (response.ok && response.body) return Readable.fromWeb(response.body as any);
    } catch (e: unknown) {
      const error = e as Error;
      console.error(`[JS-YT] Direct URL error:`, error.message);
    }
  }

  const originalInfo = videoInfo.original_info;
  if (originalInfo) {
    const downloadOptions: any = { quality: 'best', type: 'audio', format: 'mp4' };
    if (!isNaN(itagNum)) downloadOptions.itag = itagNum;
    try {
      const webStream = await originalInfo.download(downloadOptions);
      return Readable.fromWeb(webStream);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[JS-YT] Innertube.download failed:`, error.message);
    }
  }

  if (!options._retried) {
     const freshInfo = await getFallbackInfo(`https://www.youtube.com/watch?v=${videoInfo.id}`);
     return getStream(freshInfo, { ...options, _retried: true });
  }
  
  throw new Error("Failed to secure a working audio stream after multiple attempts.");
}
