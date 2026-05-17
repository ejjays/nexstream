import { Request, Response } from 'express';
import { VideoInfo, Format } from '../types/index.js';
import { sendEvent, sendBufferedEvent } from './sse.util.js';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const isDirect = (f: Format): boolean =>
  Boolean(f.url &&
  !f.url.includes('youtube.com/watch') &&
  !f.url.includes('youtu.be/') &&
  (!f.note || (
    !f.note.includes('m3u8') &&
    !f.note.includes('manifest')
  )) &&
  !f.url.includes('.m3u8'));

export const isAvc = (f: Format | null | undefined): boolean => {
  if (!f) return false;
  const vcodec = f.vcodec || '';
  return vcodec.startsWith('avc1') || vcodec.startsWith('h264');
};

export function selectVideoFormat(formats: Format[], formatId: string | undefined): Format | null {
  const isMuxed = (f: Format) => f.vcodec !== 'none' && f.acodec !== 'none';
  const videoFormats = formats.filter(f => f.vcodec && f.vcodec !== 'none');

  if (videoFormats.length === 0) return null;

  const h264Formats = videoFormats.filter(f => 
    f.vcodec?.startsWith('avc1') || f.vcodec?.startsWith('h264')
  );

  const available = (h264Formats.length > 0 ? h264Formats : videoFormats)
    .sort((a, b) => {
      const hA = a.height || 0;
      const hB = b.height || 0;
      if (hB !== hA) return hB - hA;
      if (isMuxed(b) && !isMuxed(a)) return 1;
      return -1;
    });

  const requested = videoFormats.find(f => String(f.format_id) === String(formatId));
  if (requested) return requested;

  return available.find(f => (f.height || 0) <= 1080) || available[0];
}

export function selectAudioFormat(
  formats: Format[], 
  formatId: string | undefined, 
  isAudioOnly: boolean, 
  needsWebm: boolean
): Format | null {
  const availableAudioOnly = formats.filter(f => f.acodec !== 'none' && (f.vcodec === 'none' || !f.is_video));

  const m4aAudio = availableAudioOnly
    .filter(f => f.ext === 'm4a')
    .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
  const webmAudio = availableAudioOnly
    .filter(f => f.ext === 'webm' || f.acodec === 'opus')
    .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

  const requested = isAudioOnly ? formats.find(f => String(f.format_id) === String(formatId)) : null;

  return (requested as Format) || 
         (needsWebm && webmAudio ? webmAudio : m4aAudio || webmAudio) ||
         formats.find(f => f.acodec !== 'none') || null;
}

export function buildProxyUrl(req: Request, format: Format | null | undefined, targetUrl: string): string | null {
  if (!format?.format_id) return null;
  
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
      artist: info.uploader || info.artist
    }
  };
}

export function setupStreamListeners(
  videoProcess: NodeJS.ReadableStream,
  res: Response,
  clientId: string | undefined,
  totalBytesSent: { value: number }
) {
  let lastReportedProgress = 30;
  let bytesSinceLastReport = 0;

  if (clientId) {
    sendEvent(clientId, {
      status: 'downloading',
      progress: 30,
      subStatus: 'STREAMING: Initializing Handshake...'
    });
  }

  const readable = videoProcess as unknown as NodeJS.EventEmitter & { pipe: (res: Response) => void };
  if (typeof readable.on === 'function') {
      readable.on('progress', (progress: number) => {
        if (clientId) {
          const scaledProgress = 30 + (progress * 0.65);
          const newProgress = Math.min(95, Math.round(scaledProgress));
          
          if (newProgress > lastReportedProgress) {
            lastReportedProgress = newProgress;
            sendBufferedEvent(clientId, {
              status: 'downloading',
              progress: newProgress,
              subStatus: `STREAMING: ${progress.toFixed(1)}%`
            });
          }
        }
      });
  }

  const progressObserver = new Transform({
    highWaterMark: 5 * 1024 * 1024,
    transform(chunk, encoding, callback) {
      bytesSinceLastReport += chunk.length;
      totalBytesSent.value += chunk.length;

      if (totalBytesSent.value === chunk.length) {
        console.log(`[StreamUtil] First chunk received for client ${clientId} (${chunk.length} bytes)`);
        if (clientId) {
          sendEvent(clientId, {
            status: 'downloading',
            progress: lastReportedProgress,
            subStatus: 'TRANSMITTING: Streaming via EME'
          });
        }
      }

      if (bytesSinceLastReport > 256 * 1024) {
         bytesSinceLastReport = 0;
         if (clientId) {
           sendBufferedEvent(clientId, {
             status: 'downloading',
             progress: lastReportedProgress,
             subStatus: `TRANSMITTING: ${(totalBytesSent.value / (1024 * 1024)).toFixed(1)} MB Sent`
           });
         }
      }

      callback(null, chunk);
    }
  });

  if (typeof readable.pipe === 'function') {
      pipeline(videoProcess as unknown as import('stream').Readable, progressObserver, res).catch(err => {
        if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
            console.error('[Stream] Pipeline failed:', err.message);
        }
      });
  }

  videoProcess.on('close', () => {
    console.log(`[StreamUtil] Stream closed for client ${clientId} (Total: ${(totalBytesSent.value / (1024 * 1024)).toFixed(1)}MB)`);
    if (clientId) {
      sendEvent(clientId, {
        status: 'finished',
        progress: 100,
        subStatus: `STREAMING: Finalized (${(totalBytesSent.value / (1024 * 1024)).toFixed(1)}MB)`
      });
    }
    if (!res.writableEnded) res.end();
  });

  videoProcess.on('error', (error: unknown) => {
    const typedError = error as NodeJS.ErrnoException;
    if (typedError.code === 'ERR_STREAM_WRITE_AFTER_END') return;
    console.error('[Convert] Stream Error:', typedError.message);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Stream generation failed' });
    } else {
        if (!res.writableEnded) res.end();
    }
  });
}
