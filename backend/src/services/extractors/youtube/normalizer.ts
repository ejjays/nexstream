import { VideoInfo, Format } from '../../../types/index.js';

interface RawFormat {
  has_video?: boolean;
  has_audio?: boolean;
  url?: string;
  signatureCipher?: string;
  signature_cipher?: string;
  decipher?: (player: any) => Promise<string>;
  itag?: number;
  quality_label?: string;
  qualityLabel?: string;
  quality?: string;
  width?: number;
  height?: number;
  fps?: number;
  mime_type?: string;
  mimeType?: string;
}

interface YT {
  session: {
    player?: {
      decipher: (sig: string) => Promise<string>;
    };
  };
  getInfo: (id: string) => Promise<VideoInfo>;
}

export async function mapFormats(allFormats: RawFormat[], videoId: string, yt: YT): Promise<Format[]> {
  return (await Promise.all(
    allFormats.map(async f => {
        const isMuxed = f.has_video && f.has_audio;
        const isAudio = f.has_audio && !f.has_video;
        
        let formatUrl = (f.url || f.signatureCipher || f.signature_cipher) ? (f.url || '').toString() : '';
        const cipher = f.signatureCipher || f.signature_cipher;
        
        if (!formatUrl && cipher) {
           try { 
             const player = yt.session.player || await yt.getInfo(videoId).then(res => yt.session.player);
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
           } catch(e: unknown) {
             console.error(`[JS-YT] Decipher failed for itag ${f.itag}:`, (e as Error).message);
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
}

interface RawVideoInfo {
  basic_info: {
    author?: string;
    thumbnail?: { url: string }[];
    title: string;
    duration: number;
  };
  primary_info?: {
    author?: { name: string };
  };
}

export function normalizeVideoInfo(videoId: string, url: string, videoInfo: RawVideoInfo, mappedFormats: Format[]): VideoInfo {
  const { basic_info: basic } = videoInfo;
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
