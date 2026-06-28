import { VideoInfo, ExtractorError } from '../types';
import { getInfo as youtubeGetInfo } from '../youtube';
import { searchViaWebView, type YtSearchResult } from '../youtube/bridge';
import {
  parseTrackId,
  fetchSpotifyTrack,
  fetchOdesli,
  fetchSpotifyEmbed,
  type SpotifyTrack,
  type SpotifyEmbed,
  type OdesliResult,
} from './api';
import { lookupSpotifyMapping } from '../../lib/social/registry';
import { noVideo, temporaryError } from '../errors';

type Meta = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  durationMs: number;
  isrc?: string;
};

// auto-generated youtube music uploads; their audio 403s on some networks
export function isTopicChannel(author?: string): boolean {
  return (author ?? '').toLowerCase().trim().endsWith('- topic');
}

export function pickBest(
  candidates: YtSearchResult[],
  targetMs: number,
  artist: string
): YtSearchResult | null {
  const artistLc = artist.toLowerCase();
  const targetSec = targetMs > 0 ? Math.round(targetMs / 1000) : 0;

  const ranked = candidates
    .map((candidate) => {
      const durDiff =
        targetSec > 0 && typeof candidate.durationSec === 'number'
          ? Math.abs(candidate.durationSec - targetSec)
          : Number.POSITIVE_INFINITY;
      const artistMatch = (candidate.author ?? '')
        .toLowerCase()
        .includes(artistLc);
      return {
        candidate,
        durDiff,
        artistMatch,
        topic: isTopicChannel(candidate.author),
      };
    })
    .sort((lhs, rhs) => {
      // prefer downloadable regular uploads over topic art tracks
      if (lhs.topic !== rhs.topic) return lhs.topic ? 1 : -1;
      if (lhs.artistMatch !== rhs.artistMatch) return lhs.artistMatch ? -1 : 1;
      return lhs.durDiff - rhs.durDiff;
    });

  return ranked[0]?.candidate ?? candidates[0] ?? null;
}

function partial(meta: Meta, url: string): VideoInfo {
  return {
    type: 'video',
    id: meta.id,
    title: meta.title,
    uploader: meta.artist,
    webpageUrl: url,
    thumbnail: meta.cover,
    duration: meta.durationMs ? Math.round(meta.durationMs / 1000) : undefined,
    formats: [],
    extractorKey: 'spotify',
    isJsInfo: true,
    fromBrain: false,
    isPartial: true,
    isIsrcMatch: Boolean(meta.isrc),
    isFullData: false,
  };
}

function metaFromSpotify(id: string, track: SpotifyTrack): Meta {
  return {
    id,
    title: track.title,
    artist: track.artist,
    cover: track.cover,
    durationMs: track.durationMs,
    isrc: track.isrc,
  };
}

function metaFromEmbed(id: string, embed: SpotifyEmbed): Meta | null {
  if (!embed.title || !embed.artist) return null;
  return {
    id,
    title: embed.title,
    artist: embed.artist,
    cover: embed.cover,
    durationMs: embed.durationMs || 0,
    isrc: embed.isrc,
  };
}

function metaFromOdesli(id: string, odesli: OdesliResult): Meta | null {
  if (!odesli.title || !odesli.artist) return null;
  return {
    id,
    title: odesli.title,
    artist: odesli.artist,
    cover: odesli.cover,
    durationMs: 0,
    isrc: odesli.isrc,
  };
}

// earliest source with title+artist, for a fast first paint
async function firstPaintMeta(
  id: string,
  embedP: Promise<SpotifyEmbed | null>,
  spotifyP: Promise<SpotifyTrack | null>,
  odesliP: Promise<OdesliResult | null>
): Promise<Meta | null> {
  const need = <T>(
    source: Promise<T | null>,
    toMeta: (value: T) => Meta | null
  ): Promise<Meta> =>
    source.then((value) => {
      const meta = value ? toMeta(value) : null;
      if (!meta) throw new Error('incomplete');
      return meta;
    });
  try {
    return await Promise.any([
      need(embedP, (embed) => metaFromEmbed(id, embed)),
      need(spotifyP, (track) => metaFromSpotify(id, track)),
      need(odesliP, (odesli) => metaFromOdesli(id, odesli)),
    ]);
  } catch {
    return null;
  }
}

async function resolveVideoUrl(
  odesliYoutube: string | undefined,
  meta: Meta
): Promise<string | null> {
  // prefer odesli's known-good mapping
  if (odesliYoutube) return odesliYoutube;

  const candidates: YtSearchResult[] = [];
  const byTitle = await searchViaWebView(`${meta.artist} ${meta.title}`);
  if (byTitle) candidates.push(...byTitle);

  // isrc nails the exact recording but is usually a "- topic" art track
  // whose audio 403s on some networks; only reach for it when title search
  // turned up no regular (non-topic) upload
  if (meta.isrc && !candidates.some((cand) => !isTopicChannel(cand.author))) {
    const byIsrc = await searchViaWebView(`"${meta.isrc}"`);
    if (byIsrc) candidates.push(...byIsrc);
  }

  if (candidates.length === 0) return null;
  const best = pickBest(candidates, meta.durationMs, meta.artist);
  return best ? `https://www.youtube.com/watch?v=${best.id}` : null;
}

// extract the matched youtube video on-device; cached stream urls are
// ip-bound so we re-extract, reusing only the mapping
async function buildResult(
  meta: Meta,
  url: string,
  videoUrl: string,
  fromBrain: boolean
): Promise<VideoInfo | null> {
  const yt = await youtubeGetInfo(videoUrl);
  if (!yt) return null;

  const audioOnly = yt.formats.filter(
    (format) => format.isAudio && !format.isVideo
  );

  return {
    ...yt,
    formats: audioOnly,
    id: meta.id,
    title: meta.title,
    uploader: meta.artist,
    album: meta.album,
    webpageUrl: url,
    thumbnail: meta.cover || yt.thumbnail,
    duration: meta.durationMs
      ? Math.round(meta.durationMs / 1000)
      : yt.duration,
    extractorKey: 'spotify',
    fromBrain,
    isIsrcMatch: Boolean(meta.isrc),
  };
}

// prefer api > embed > odesli for the authoritative meta
function mergeMeta(
  id: string,
  embed: SpotifyEmbed | null,
  spotify: SpotifyTrack | null,
  odesli: OdesliResult | null
): Meta | null {
  const title = spotify?.title || embed?.title || odesli?.title;
  const artist = spotify?.artist || embed?.artist || odesli?.artist;
  if (!title || !artist) return null;
  return {
    id,
    title,
    artist,
    album: spotify?.album,
    cover: spotify?.cover || embed?.cover || odesli?.cover,
    durationMs: spotify?.durationMs || embed?.durationMs || 0,
    isrc: spotify?.isrc || embed?.isrc || odesli?.isrc,
  };
}

// null = no cached hit, fall through to fresh resolve
async function resolveFromRegistry(
  trackId: string,
  url: string,
  cleanUrl: string,
  onPartial?: (info: VideoInfo) => void
): Promise<VideoInfo | null> {
  const cached = await lookupSpotifyMapping(cleanUrl);
  if (!cached) return null;
  const meta: Meta = {
    id: trackId,
    title: cached.title,
    artist: cached.artist,
    cover: cached.cover,
    durationMs: cached.durationMs,
    isrc: cached.isrc,
  };
  onPartial?.(partial(meta, url));
  try {
    return await buildResult(meta, url, cached.youtubeUrl, true);
  } catch {
    // stale/blocked mapping -> fall through to fresh resolve
    return null;
  }
}

export async function getInfo(
  url: string,
  onPartial?: (info: VideoInfo) => void
): Promise<VideoInfo | null> {
  const trackId = parseTrackId(url);
  if (!trackId) return null;
  const cleanUrl = url.split('?')[0];

  try {
    // registry-first: a known mapping skips the resolution race
    const fromRegistry = await resolveFromRegistry(
      trackId,
      url,
      cleanUrl,
      onPartial
    );
    if (fromRegistry) return fromRegistry;

    const embedP = fetchSpotifyEmbed(trackId);
    const spotifyP = fetchSpotifyTrack(trackId);
    const odesliP = fetchOdesli(trackId);

    // paint the picker from whichever source lands first
    let painted = false;
    if (onPartial) {
      void firstPaintMeta(trackId, embedP, spotifyP, odesliP).then((early) => {
        if (early && !painted) onPartial(partial(early, url));
      });
    }

    const [embed, spotify, odesli] = await Promise.all([
      embedP.catch(() => null),
      spotifyP.catch(() => null),
      odesliP.catch(() => null),
    ]);

    const meta = mergeMeta(trackId, embed, spotify, odesli);
    if (!meta) throw temporaryError('Spotify', 'track');

    painted = true;
    onPartial?.(partial(meta, url));

    const videoUrl = await resolveVideoUrl(odesli?.youtubeUrl, meta);
    if (!videoUrl) throw noVideo('Spotify', 'track');

    console.log(
      `[Spotify] resolved -> ${videoUrl} (isrc=${meta.isrc || 'none'})`
    );
    const result = await buildResult(meta, url, videoUrl, false);
    if (!result) throw noVideo('Spotify', 'track');
    return result;
  } catch (error) {
    // resolution may bubble a youtube error; keep it spotify-framed
    const retryable = !(error instanceof ExtractorError) || error.retryable;
    throw retryable
      ? temporaryError('Spotify', 'track')
      : noVideo('Spotify', 'track');
  }
}
