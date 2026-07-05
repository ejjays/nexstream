import { VideoInfo, Format, ExtractorError } from './types';
import { gatedFetch } from '../lib/net';
import {
  notFound,
  restricted,
  noVideo,
  fromStatus,
  classifyThrown,
} from './errors';
import { DESKTOP_UA } from '../lib/userAgents';
import { error as logError, warn as logWarn } from '../lib/log';
const REFERER = 'https://www.dailymotion.com/';

interface DmStream {
  type?: string;
  url?: string;
}
interface DmMeta {
  id?: string;
  title?: string;
  duration?: number;
  owner?: { screenname?: string; username?: string };
  thumbnails?: Record<string, string>;
  qualities?: Record<string, DmStream[]>;
  error?: { title?: string; raw_message?: string; code?: string | number };
}

// map dailymotion's error code to a typed error
function dmError(error: NonNullable<DmMeta['error']>): ExtractorError {
  const code = String(error.code ?? '');
  if (code === '404') return notFound('Dailymotion');
  if (code === 'DM016') return restricted('Dailymotion', 'by its owner');
  return error.title
    ? new ExtractorError(
        `This Dailymotion video can't be loaded — ${error.title}.`,
        false
      )
    : noVideo('Dailymotion');
}

interface DmInfo {
  id: string;
  title?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
}

function buildInfo(meta: DmInfo, url: string, formats: Format[]): VideoInfo {
  return {
    type: 'video',
    id: meta.id,
    title: meta.title || 'Dailymotion Video',
    uploader: meta.uploader || 'Dailymotion',
    webpageUrl: url,
    thumbnail: meta.thumbnail,
    duration: meta.duration,
    formats,
    extractorKey: 'dailymotion',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: true,
    downloadHeaders: { 'User-Agent': DESKTOP_UA, Referer: REFERER },
  };
}

function parseId(url: string): string | null {
  const match = url.match(
    /(?:dailymotion\.com\/(?:embed\/)?video\/|dai\.ly\/)([a-z0-9]+)/iu
  );
  return match ? match[1] : null;
}

// largest sized thumbnail
function pickThumb(thumbs?: Record<string, string>): string | undefined {
  if (!thumbs) return undefined;
  const sized = Object.entries(thumbs)
    .filter(([key]) => /^\d+$/u.test(key))
    .sort((lhs, rhs) => Number(rhs[0]) - Number(lhs[0]));
  return sized[0]?.[1] ?? Object.values(thumbs)[0];
}

// master -> per-quality variants; separate audio rendition if present, else muxed
async function buildHlsFormats(
  master: string,
  durationSec: number
): Promise<Format[]> {
  let text: string;
  try {
    const res = await gatedFetch(master, {
      headers: { 'User-Agent': DESKTOP_UA, Referer: REFERER },
    });
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }
  const lines = text.split('\n');
  let audioUrl: string | undefined;
  for (const line of lines) {
    if (line.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/u.test(line)) {
      const uri = line.match(/URI="([^"]+)"/u)?.[1];
      if (uri) {
        audioUrl = new URL(uri, master).toString();
        break;
      }
    }
  }
  const seen = new Set<number>();
  const formats: Format[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
    const attrs = lines[i];
    const dims = attrs.match(/RESOLUTION=(\d+)x(\d+)/u);
    const uri = lines[i + 1]?.trim();
    if (!dims || !uri || uri.startsWith('#')) continue;
    const height = Number(dims[2]);
    if (seen.has(height)) continue;
    seen.add(height);
    const bw = Number(
      attrs.match(/AVERAGE-BANDWIDTH=(\d+)/u)?.[1] ??
        attrs.match(/[^-]BANDWIDTH=(\d+)/u)?.[1] ??
        0
    );
    const codecs = attrs.match(/CODECS="([^"]+)"/u)?.[1] ?? '';
    formats.push({
      formatId: `${height}p`,
      url: new URL(uri, master).toString(),
      hlsAudioUrl: audioUrl,
      extension: 'mp4',
      resolution: `${dims[1]}x${dims[2]}`,
      quality: `${height}p`,
      width: Number(dims[1]),
      height,
      filesize:
        bw > 0 && durationSec > 0
          ? Math.round((bw / 8) * durationSec)
          : undefined,
      vcodec: /av01/u.test(codecs)
        ? 'av1'
        : /hvc1|hev1/u.test(codecs)
          ? 'hevc'
          : 'h264',
      acodec: 'aac',
      isVideo: true,
      isAudio: false,
      isMuxed: true,
      isHls: true,
      hlsKeepAlive: true,
    });
  }
  formats.sort((lhs, rhs) => (rhs.height ?? 0) - (lhs.height ?? 0));
  return formats;
}

export async function getInfo(url: string): Promise<VideoInfo | null> {
  try {
    const id = parseId(url);
    if (!id) return null;

    const res = await gatedFetch(
      `https://www.dailymotion.com/player/metadata/video/${id}`,
      { headers: { 'User-Agent': DESKTOP_UA, Referer: REFERER } }
    );
    if (!res.ok) throw fromStatus(res.status, 'Dailymotion');
    const meta = (await res.json()) as DmMeta;
    // publisher/geo restriction (e.g. DM016) -> surface why, not generic
    if (meta.error) {
      logWarn(
        'dailymotion',
        `[JS-Dailymotion] ${meta.error.code ?? '?'}: ${meta.error.raw_message ?? meta.error.title ?? ''}`
      );
      throw dmError(meta.error);
    }
    const master = meta.qualities?.auto?.[0]?.url;
    if (!master) throw noVideo('Dailymotion');

    const formats = await buildHlsFormats(master, meta.duration ?? 0);
    // master unparsed -> hand the master to ffmpeg directly
    if (formats.length === 0) {
      formats.push({
        formatId: 'auto',
        url: master,
        extension: 'mp4',
        quality: 'Auto',
        vcodec: 'h264',
        acodec: 'aac',
        isVideo: true,
        isAudio: false,
        isMuxed: true,
        isHls: true,
        hlsKeepAlive: true,
      });
    }

    return buildInfo(
      {
        id: meta.id || id,
        title: meta.title,
        uploader: meta.owner?.screenname,
        duration: meta.duration,
        thumbnail: pickThumb(meta.thumbnails),
      },
      url,
      formats
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError(
      'dailymotion',
      `[JS-Dailymotion] Error extracting ${url}: ${message}`
    );
    throw classifyThrown(error, 'Dailymotion');
  }
}
