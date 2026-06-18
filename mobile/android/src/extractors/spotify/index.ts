import { VideoInfo } from '../types';
import { getInfo as youtubeGetInfo } from '../youtube';
import { searchViaWebView, type YtSearchResult } from '../youtube/bridge';
import { parseTrackId, fetchSpotifyTrack, fetchOdesli } from './api';

type Meta = {
  id: string;
  title: string;
  artist: string;
  cover?: string;
  durationMs: number;
  isrc?: string;
};

function pickBest(
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
      return { candidate, durDiff, artistMatch };
    })
    .sort((lhs, rhs) => {
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

async function resolveVideoUrl(
  odesliYoutube: string | undefined,
  meta: Meta
): Promise<string | null> {
  if (odesliYoutube) return odesliYoutube;
  const candidates = await searchViaWebView(`${meta.artist} ${meta.title}`);
  if (!candidates || candidates.length === 0) return null;
  const best = pickBest(candidates, meta.durationMs, meta.artist);
  return best ? `https://www.youtube.com/watch?v=${best.id}` : null;
}

export async function getInfo(
  url: string,
  onPartial?: (info: VideoInfo) => void
): Promise<VideoInfo | null> {
  const trackId = parseTrackId(url);
  if (!trackId) return null;

  const [odesli, spotify] = await Promise.all([
    fetchOdesli(trackId),
    fetchSpotifyTrack(trackId),
  ]);

  const title = spotify?.title || odesli?.title;
  const artist = spotify?.artist || odesli?.artist;
  if (!title || !artist) return null;

  const meta: Meta = {
    id: trackId,
    title,
    artist,
    cover: spotify?.cover || odesli?.cover,
    durationMs: spotify?.durationMs || 0,
    isrc: spotify?.isrc,
  };

  onPartial?.(partial(meta, url));

  const videoUrl = await resolveVideoUrl(odesli?.youtubeUrl, meta);
  if (!videoUrl) return null;

  const yt = await youtubeGetInfo(videoUrl);
  if (!yt) return null;

  const audioOnly = yt.formats.filter(
    (format) => format.isAudio && !format.isVideo
  );

  return {
    ...yt,
    formats: audioOnly,
    id: trackId,
    title,
    uploader: artist,
    webpageUrl: url,
    thumbnail: meta.cover || yt.thumbnail,
    duration: meta.durationMs
      ? Math.round(meta.durationMs / 1000)
      : yt.duration,
    extractorKey: 'spotify',
    isIsrcMatch: Boolean(meta.isrc),
  };
}
