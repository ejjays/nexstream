import { VideoInfo, Format } from '../../../types/index.js';

export async function getFallbackInfo(url: string): Promise<VideoInfo> {
  try {
    const { spawn } = await import('node:child_process');
    console.log(`[JS-YT] Fallback info: ${url}`);
    
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
          const formats: Format[] = (info.formats || []).map((f: Format) => {
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
          }).filter((f: Format) => f.url);
          
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
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error(`[JS-YT] Fallback critical failure:`, e.message);
    } else {
      console.error(`[JS-YT] Fallback critical failure:`, e);
    }
    throw e;
  }
}
