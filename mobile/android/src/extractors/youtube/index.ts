import { VideoInfo, Format } from '../types';
import { extractViaWebView, RawYtFormat, RawYtResult } from './bridge';

const YT_ID = /(?:v=|\/v\/|youtu\.be\/|shorts\/|live\/|embed\/)([0-9A-Za-z_-]{11})/u;

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function isMp4(raw: RawYtFormat): boolean {
  return raw.mimeType?.includes('mp4') ?? false;
}

function baseFormat(raw: RawYtFormat, index: number): Format {
  const webm = raw.mimeType?.includes('webm') ?? false;
  const ext = raw.hasVideo ? (webm ? 'webm' : 'mp4') : webm ? 'webm' : 'm4a';
  return {
    formatId: String(raw.itag ?? `yt_${index}`),
    url: raw.url ?? '',
    extension: ext,
    resolution: raw.qualityLabel || (raw.height ? `${raw.height}p` : undefined),
    quality:
      raw.qualityLabel ||
      (raw.hasAudio && !raw.hasVideo ? raw.audioQuality || 'Audio' : undefined),
    width: raw.width,
    height: raw.height,
    tbr: raw.bitrate ? Math.round(raw.bitrate / 1000) : undefined,
    vcodec: raw.hasVideo ? (webm ? 'vp9' : 'h264') : 'none',
    acodec: raw.hasAudio ? (webm ? 'opus' : 'aac') : 'none',
    isVideo: Boolean(raw.hasVideo),
    isAudio: Boolean(raw.hasAudio),
    isMuxed: Boolean(raw.hasVideo && raw.hasAudio),
    filesize: raw.contentLength ? Number(raw.contentLength) : undefined,
  };
}

function bestAudio(
  audios: RawYtFormat[],
  container: 'mp4' | 'webm'
): RawYtFormat | undefined {
  return audios
    .filter((a) => a.mimeType?.includes(container) ?? false)
    .sort((x, y) => (y.bitrate ?? 0) - (x.bitrate ?? 0))[0];
}

function buildFormats(raw: RawYtResult): Format[] {
  const rawAll = [...(raw.formats || []), ...(raw.adaptive || [])].filter(
    (f) => f.url
  );
  const muxed = rawAll.filter((f) => f.hasVideo && f.hasAudio);
  const videoOnly = rawAll.filter((f) => f.hasVideo && !f.hasAudio);
  const audioOnly = rawAll.filter((f) => f.hasAudio && !f.hasVideo);

  const aac = bestAudio(audioOnly, 'mp4');
  const opus = bestAudio(audioOnly, 'webm');

  /* dedupe by height; prefer muxed */
  const ladder = new Map<number, Format>();
  muxed.forEach((fmt, i) => {
    const format = baseFormat(fmt, 1000 + i);
    ladder.set(format.height ?? 0, format);
  });

  const byHeight = new Map<number, RawYtFormat>();
  for (const video of videoOnly) {
    const height = video.height ?? 0;
    const current = byHeight.get(height);
    if (!current || (isMp4(video) && !isMp4(current))) {
      byHeight.set(height, video);
    }
  }

  let index = 0;
  for (const video of byHeight.values()) {
    const height = video.height ?? 0;
    if (ladder.has(height)) continue;
    const audio = isMp4(video) ? aac ?? opus : opus ?? aac;
    if (!audio?.url) continue;
    const format = baseFormat(video, index++);
    format.extension = isMp4(video) ? 'mp4' : 'webm';
    format.muxAudioUrl = audio.url;
    format.muxAudioExt = audio.mimeType?.includes('mp4') ? 'm4a' : 'webm';
    const sum =
      (video.contentLength ? Number(video.contentLength) : 0) +
      (audio.contentLength ? Number(audio.contentLength) : 0);
    format.filesize = sum > 0 ? sum : undefined;
    ladder.set(height, format);
  }

  const videoLadder = [...ladder.values()].sort(
    (lhs, rhs) => (rhs.height ?? 0) - (lhs.height ?? 0)
  );
  const audioFormats = aac ? [baseFormat(aac, 2000)] : [];
  return [...videoLadder, ...audioFormats];
}

export async function getInfo(url: string): Promise<VideoInfo | null> {
  const match = url.match(YT_ID);
  const videoId = match ? match[1] : null;
  if (!videoId) return null;

  const raw = await extractViaWebView(videoId);
  if (!raw) return null;

  const formats = buildFormats(raw);
  if (formats.length === 0) return null;

  return {
    type: 'video',
    id: videoId,
    title: raw.title || 'YouTube Video',
    uploader: raw.author || 'YouTube',
    webpageUrl: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: raw.thumbnail,
    duration: raw.duration,
    formats,
    extractorKey: 'youtube',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: true,
    downloadHeaders: {
      'User-Agent': DESKTOP_UA,
      Accept: '*/*',
      Referer: 'https://www.youtube.com/',
      Origin: 'https://www.youtube.com',
    },
  };
}
