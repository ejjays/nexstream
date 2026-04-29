import { Request, Response } from 'express';
import { VideoInfo, Format, SSEEvent } from '../types/index.js';
import { sendEvent } from './sse.util.js';

export const isDirect = (f: Format): boolean =>
  !!(f.url &&
  !f.url.includes('youtube.com/watch') &&
  !f.url.includes('youtu.be/') &&
  (!f.note || ( // Using note instead of protocol as it's often stored there in yt-dlp simplified info
    !f.note.includes('m3u8') &&
    !f.note.includes('manifest')
  )) &&
  !f.url.includes('.m3u8'));

export const isAvc = (f: Format | null | undefined): boolean => {
  if (!f) return false;
  const vcodec = f.vcodec || '';
  // strict check for h264
  return vcodec.startsWith('avc1') || vcodec.startsWith('h264');
};

export function selectVideoFormat(formats: Format[], formatId: string | undefined): Format | null {
  const isMuxed = (f: Format) => f.vcodec !== 'none' && f.acodec !== 'none';
  
  // prefer h264
  const videoFormats = formats.filter(f => f.vcodec && f.vcodec !== 'none');

  if (videoFormats.length === 0) return null;

  const h264Formats = videoFormats.filter(f => 
    f.vcodec?.startsWith('avc1') || f.vcodec?.startsWith('h264')
  );

  const available = (h264Formats.length > 0 ? h264Formats : videoFormats)
    .sort((a, b) => {
      const hA = (a as any).height || 0;
      const hB = (b as any).height || 0;
      if (hB !== hA) return hB - hA;
      if (isMuxed(b) && !isMuxed(a)) return 1;
      return -1;
    });

  // check requested
  const requested = videoFormats.find(f => String(f.format_id) === String(formatId));
  if (requested) return requested;

  // fallback quality
  const selected = available.find(f => ((f as any).height || 0) <= 1080) || available[0];

  return selected;
}

export function selectAudioFormat(
  formats: Format[], 
  formatId: string | undefined, 
  isAudioOnly: boolean, 
  needsWebm: boolean
): Format | null {
  const available = formats.filter(f => f.acodec !== 'none');
  const m4aAudio = available
    .filter(f => f.ext === 'm4a')
    .sort((a, b) => ((b as any).abr || 0) - ((a as any).abr || 0))[0];
  const webmAudio = available
    .filter(f => f.ext === 'webm' || f.acodec === 'opus')
    .sort((a, b) => ((b as any).abr || 0) - ((a as any).abr || 0))[0];

  const requested =
    isAudioOnly && formats.find(f => String(f.format_id) === String(formatId))
      ? formats.find(f => String(f.format_id) === String(formatId))
      : null;

  return (requested as Format) || (needsWebm && webmAudio ? webmAudio : m4aAudio || webmAudio);
}

export function buildProxyUrl(req: Request, format: Format | null | undefined, targetUrl: string): string | null {
  if (!format || !format.format_id) return null;
  
  // handle proxy headers
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  
  const baseUrl = `${protocol}://${host}/proxy?targetUrl=${encodeURIComponent(targetUrl)}&formatId=${format.format_id}&ext=${format.ext || 'mp4'}`;
  if (isDirect(format)) {
      return `${baseUrl}&rawUrl=${encodeURIComponent(format.url)}`;
  }
  return baseUrl;
}

export function getOutputMetadata(isAudioOnly: boolean, emeExtension: string, info: VideoInfo) {
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    webm: isAudioOnly ? 'audio/webm' : 'video/webm',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png'
  };

  const type = mimeMap[emeExtension] || (isAudioOnly ? `audio/${emeExtension}` : 'video/mp4');

  return {
    type,
    metadata: {
      title: info.title,
      artist: info.uploader || (info as any).artist
    }
  };
}

export function setupStreamListeners(
  videoProcess: any, 
  res: Response, 
  clientId: string | undefined, 
  totalBytesSent: { value: number }
) {
  if (clientId) {
    sendEvent(clientId, {
      status: 'downloading',
      progress: 30,
      subStatus: 'STREAMING: Initializing Handshake...'
    });
  }

  videoProcess.on('progress', (progress: number) => {
    if (clientId) {
      const scaledProgress = 30 + (progress * 0.70);
      sendEvent(clientId, {
        status: 'downloading',
        progress: Math.min(100, Math.round(scaledProgress)),
        subStatus: `STREAMING: ${progress.toFixed(1)}%`
      });
    }
  });

  videoProcess.on('data', (chunk: any) => {
    if (totalBytesSent.value === 0) {
      if (clientId) {
        sendEvent(clientId, {
          status: 'downloading',
          progress: 30,
          subStatus: 'TRANSMITTING: Streaming via EME'
        });
      }
    }
    totalBytesSent.value += chunk.length;
  });

  videoProcess.pipe(res);

  videoProcess.on('close', (code: number) => {
    if (clientId) {
      sendEvent(clientId, {
        status: 'finished',
        progress: 100,
        subStatus: `STREAMING: Finalized (${(totalBytesSent.value / (1024 * 1024)).toFixed(1)}MB)`
      });
    }
    // finalize stream
    if (!res.writableEnded) res.end();
  });

  videoProcess.on('error', (err: any) => {
    if (err.code === 'ERR_STREAM_WRITE_AFTER_END') return;
    console.error('[Convert] Stream Error:', err.message);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Stream generation failed' });
    } else {
        if (!res.writableEnded) res.end();
    }
  });
}
