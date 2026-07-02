import { VideoInfo, Format, ExtractorError } from './types';
import { gatedFetch } from '../lib/net';
import { noVideo, fromStatus, temporaryError, classifyThrown } from './errors';
import { getScClientId, setScClientId } from '../lib/settings';
import { DESKTOP_UA } from '../lib/userAgents';
import { buildVideoInfo } from './videoInfo';

const API = 'https://api-v2.soundcloud.com';
const CLIENT_ID_TTL = 3600000;

const SC_DEBUG = false;
function dbg(...parts: unknown[]): void {
  if (SC_DEBUG) console.log('[JS-SoundCloud]', ...parts);
}

let cachedClientId: string | null = null;
let clientIdAt = 0;

/**
 * soundcloud ships no public api key, so client_id is scraped
 * from homepage's assets bundle. rotates → cache 1h.
 */
async function getClientId(): Promise<string | null> {
  if (cachedClientId && Date.now() - clientIdAt < CLIENT_ID_TTL) {
    return cachedClientId;
  }
  // survives reloads; id stable for hours
  const stored = await getScClientId();
  if (stored && Date.now() - stored.at < CLIENT_ID_TTL) {
    cachedClientId = stored.id;
    clientIdAt = stored.at;
    return cachedClientId;
  }
  try {
    const res = await gatedFetch('https://soundcloud.com/', {
      headers: { 'User-Agent': DESKTOP_UA },
    });
    const html = await res.text();
    const scripts = [
      ...html.matchAll(/src="(https:\/\/[^"]+\/assets\/[^"]+\.js)"/gu),
    ]
      .map((hit) => hit[1])
      .reverse();
    for (const src of scripts) {
      const body = await (
        await gatedFetch(src, { headers: { 'User-Agent': DESKTOP_UA } })
      ).text();
      const id = body.match(/client_id:"([a-zA-Z0-9]{32})"/u);
      if (id) {
        cachedClientId = id[1];
        clientIdAt = Date.now();
        void setScClientId(cachedClientId);
        return cachedClientId;
      }
    }
  } catch {
    /* fall through to cached */
  }
  return cachedClientId;
}

// warm client_id at startup; unblocks first resolve
export function prewarmClientId(): void {
  void getClientId();
}

interface Transcoding {
  url: string;
  format: { protocol: string; mime_type: string };
}
interface Track {
  policy?: string;
  duration?: number;
  full_duration?: number;
  title?: string;
  media?: { transcodings?: Transcoding[] };
  id?: string | number;
  user?: { username?: string; avatar_url?: string };
  artwork_url?: string;
}

function pickThumbnail(track: Track): string | undefined {
  const art = track.artwork_url || track.user?.avatar_url;
  return art ? art.replace('-large', '-t500x500') : undefined;
}

function pickTranscoding(track: Track): Transcoding | null {
  const list = track.media?.transcodings ?? [];
  return (
    list.find((tr) => tr.format.protocol === 'progressive') ??
    list.find(
      (tr) =>
        tr.format.protocol === 'hls' && tr.format.mime_type.includes('mp4')
    ) ??
    list.find((tr) => tr.format.protocol === 'hls') ??
    null
  );
}

// resolve won't follow share links; grab redirect target.
// first 302 Location ~1s faster than full follow.
async function permalink(url: string): Promise<string> {
  if (!/on\.soundcloud\.com/iu.test(url)) return url;
  try {
    const res = await gatedFetch(url, {
      headers: { 'User-Agent': DESKTOP_UA },
      redirect: 'manual',
    });
    const loc = res.headers?.get('location');
    dbg('permalink', loc ? 'via location' : 'no location', res.status);
    if (loc) return loc;
    if (res.url && res.url !== url) return res.url;
  } catch {
    /* fall through to full follow */
  }
  try {
    const res = await gatedFetch(url, {
      headers: { 'User-Agent': DESKTOP_UA },
      redirect: 'follow',
    });
    return res.url || url;
  } catch {
    return url;
  }
}

interface ScMeta {
  id: string;
  title: string;
  uploader: string;
  thumbnail?: string;
  duration?: number;
}

function buildInfo(
  meta: ScMeta,
  webpageUrl: string,
  formats: Format[],
  partial: boolean
): VideoInfo {
  return buildVideoInfo({
    id: meta.id,
    title: meta.title,
    uploader: meta.uploader,
    webpageUrl,
    thumbnail: meta.thumbnail,
    duration: meta.duration,
    formats,
    extractorKey: 'soundcloud',
    isPartial: partial,
    downloadHeaders: { 'User-Agent': DESKTOP_UA },
  });
}

export async function getInfo(
  url: string,
  onPartial?: (info: VideoInfo) => void
): Promise<VideoInfo | null> {
  try {
    const t0 = Date.now();
    const [clientId, target] = await Promise.all([
      getClientId(),
      permalink(url),
    ]);
    if (!clientId) throw temporaryError('SoundCloud', 'track');
    dbg('id+permalink', `${Date.now() - t0}ms`);

    const resolved = await gatedFetch(
      `${API}/resolve?url=${encodeURIComponent(target)}&client_id=${clientId}`,
      { headers: { 'User-Agent': DESKTOP_UA } }
    );
    if (!resolved.ok) throw fromStatus(resolved.status, 'SoundCloud', 'track');
    const track = (await resolved.json()) as Track;
    dbg('resolve', resolved.status, `${Date.now() - t0}ms`);

    // preview snippet, not full track
    const dur = track.duration ?? 0;
    const full = track.full_duration ?? 0;
    if (track.policy === 'SNIPPET' || (dur < 60000 && full > 60000)) {
      throw new ExtractorError(
        "This SoundCloud track is a preview only — the full track isn't available to download.",
        false
      );
    }

    const transcoding = pickTranscoding(track);
    if (!transcoding) throw noVideo('SoundCloud', 'track');

    const meta: ScMeta = {
      id: String(track.id ?? target),
      title: track.title || 'SoundCloud Audio',
      uploader: track.user?.username || 'SoundCloud',
      thumbnail: pickThumbnail(track),
      duration: track.duration ? Math.round(track.duration / 1000) : undefined,
    };
    // paint picker now; stream resolve + HEAD pending
    onPartial?.(buildInfo(meta, target, [], true));
    dbg('partial paint', `${Date.now() - t0}ms`);

    // mobile downloads format.url; resolve stream url
    const streamRes = await gatedFetch(
      `${transcoding.url}?client_id=${clientId}`,
      { headers: { 'User-Agent': DESKTOP_UA } }
    );
    if (!streamRes.ok)
      throw fromStatus(streamRes.status, 'SoundCloud', 'track');
    const { url: streamUrl } = (await streamRes.json()) as { url?: string };
    if (!streamUrl) throw noVideo('SoundCloud', 'track');

    const isHls = transcoding.format.protocol === 'hls';

    // progressive already mp3; HEAD for picker size
    let filesize: number | undefined;
    if (!isHls) {
      try {
        const head = await gatedFetch(streamUrl, {
          method: 'HEAD',
          headers: { 'User-Agent': DESKTOP_UA },
        });
        const len = head?.headers?.get('content-length');
        if (len) filesize = parseInt(len, 10);
      } catch {
        /* size optional */
      }
    }

    const format: Format = {
      formatId: 'audio',
      url: streamUrl,
      extension: isHls ? 'm4a' : 'mp3',
      quality: 'Audio',
      acodec: isHls ? 'aac' : 'mp3',
      filesize,
      isAudio: true,
      isVideo: false,
      isMuxed: false,
      isHls: isHls || undefined,
      // progressive is native mp3; save untouched
      noTranscode: isHls ? undefined : true,
    };

    dbg('full', `${Date.now() - t0}ms`);
    return buildInfo(meta, target, [format], false);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[JS-SoundCloud] Error extracting ${url}: ${message}`);
    throw classifyThrown(error, 'SoundCloud', 'track');
  }
}
