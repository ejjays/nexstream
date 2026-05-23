import { VideoInfo } from '../../types/index.js';

interface SearchResult {
  url: string;
  info: VideoInfo;
  diff: number;
}

interface MatchResult extends SearchResult {
  type: string;
  priority: number;
}

interface YtdlpService {
  COMMON_ARGS: string[];
  CACHE_DIR: string;
  cacheVideoInfo(url: string, info: VideoInfo, cookieArgs: string[]): void;
  getVideoInfo(
    url: string,
    cookieArgs: string[],
    forceRefresh?: boolean,
    signal?: AbortSignal | null
  ): Promise<VideoInfo | null>;
}

async function getYtdlpService(): Promise<YtdlpService> {
  return (await import('../ytdlp.service.js')) as unknown as YtdlpService;
}

import { refineSearchWithAI } from './ai.js';
import {
  fetchFromOdesli,
  fetchIsrcFromDeezer,
  fetchIsrcFromItunes,
} from './external.js';
import { resolveSideTasks } from './metadata.js';

interface YtSearchVideo {
  id: string;
  title?: { toString: () => string };
  author?: { name?: string };
  thumbnails?: Array<{ url: string }>;
  duration?: { seconds?: number };
}

interface SoundCloudTrack {
  permalink_url: string;
}

interface SoundCloudService {
  search(query: string): Promise<SoundCloudTrack[]>;
  getInfo(url: string): Promise<VideoInfo>;
}

const _cleanYoutubeQuery = (query: string) => {
  return query
    .replace(/on Spotify/gu, '')
    .replace(/-/gu, ' ')
    .trim();
};

const _buildYoutubeVideoInfo = (video: YtSearchVideo): VideoInfo => {
  const durationSeconds = video.duration?.seconds || 0;
  const webpageUrl = `https://www.youtube.com/watch?v=${video.id}`;
  const authorName = video.author?.name || '';

  return {
    type: 'video',
    id: video.id,
    title: video.title?.toString() || '',
    uploader: authorName,
    author: authorName,
    thumbnail: video.thumbnails?.[0]?.url || '',
    webpageUrl,
    duration: durationSeconds,
    formats: [],
    extractorKey: 'youtube',
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false,
  };
};

async function searchOnYoutube(
  query: string,
  cookieArgs: string[],
  targetMetadata: { duration?: number },
  _onEarlyDispatch: (() => void) | null = null,
  _skipPlayerOptimization = false,
  signal: AbortSignal | null = null,
  retryCount = 0
): Promise<SearchResult | null> {
  const cleanQuery = _cleanYoutubeQuery(query);
  const targetDurationMs = targetMetadata?.duration || 0;

  try {
    const { getYoutubeClient } =
      await import('../extractors/youtube/client.js');

    const youtubeClient = await getYoutubeClient();
    const searchResults = await youtubeClient.search(cleanQuery, {
      type: 'video',
    });

    if (!searchResults?.videos?.length) {
      throw new Error('No videos found');
    }

    const firstVideo = searchResults.videos[0] as unknown as YtSearchVideo;
    const info = _buildYoutubeVideoInfo(firstVideo);
    const durationMs = (info.duration || 0) * 1000;
    const drift =
      targetDurationMs > 0 && durationMs > 0
        ? Math.abs(durationMs - targetDurationMs)
        : 0;

    const ytdlp = await getYtdlpService();
    ytdlp.cacheVideoInfo(info.webpageUrl as string, info, cookieArgs);

    return { url: info.webpageUrl as string, info, diff: drift };
  } catch (error: unknown) {
    if (retryCount < 1 && !signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return searchOnYoutube(
        query,
        cookieArgs,
        targetMetadata,
        _onEarlyDispatch,
        _skipPlayerOptimization,
        signal,
        retryCount + 1
      );
    }
    console.debug(`[YouTubeSearch] Error: ${(error as Error).message}`);
    return null;
  }
}

function _evaluateCandidate(
  result: SearchResult,
  candidate: { type: string; priority: number },
  targetDuration: number,
  currentBest: MatchResult | null
): MatchResult | null {
  const driftLimit = candidate.priority <= 1 ? 120000 : 25000;
  if (targetDuration > 0 && result.diff > driftLimit) return currentBest;

  if (candidate.priority === 0)
    return { ...result, type: candidate.type, priority: candidate.priority };

  if (result.diff < 2000) {
    if (!currentBest || candidate.priority < currentBest.priority) {
      return { ...result, type: candidate.type, priority: candidate.priority };
    }
  }

  if (
    !currentBest ||
    candidate.priority < currentBest.priority ||
    (candidate.priority === currentBest.priority &&
      result.diff < currentBest.diff)
  ) {
    return { ...result, type: candidate.type, priority: candidate.priority };
  }

  return currentBest;
}

function priorityRace(
  candidates: Array<{
    type: string;
    priority: number;
    promise: Promise<SearchResult | null>;
    isFinished?: boolean;
  }>,
  metadata: { duration: number },
  onProgress: (
    stage: string,
    progress: number,
    message?: string,
    details?: string
  ) => void,
  _getElapsed: () => string,
  settleCallback?: (reason: string) => void
): Promise<MatchResult | null> {
  return new Promise<MatchResult | null>((resolve) => {
    let bestMatch: MatchResult | null = null;
    let finishedCount = 0;
    let isSettled = false;

    const settle = (match: MatchResult | null, reason = '') => {
      if (!isSettled) {
        isSettled = true;
        if (settleCallback) settleCallback(reason);
        resolve(match);
      }
    };

    for (const candidate of candidates) {
      candidate.isFinished = false;
      candidate.promise
        .then((result: SearchResult | null) => {
          candidate.isFinished = true;
          if (isSettled) return;
          finishedCount++;

          if (result) {
            bestMatch = _evaluateCandidate(
              result,
              candidate,
              metadata.duration,
              bestMatch
            );
            if (
              candidate.priority === 0 &&
              bestMatch?.type === candidate.type
            ) {
              settle(bestMatch, `${candidate.type} (VERIFIED MATCH)`);
              return;
            }
          }

          if (finishedCount >= candidates.length) {
            setTimeout(() => settle(bestMatch, 'Consensus reached'), 500);
          }
        })
        .catch(() => {
          candidate.isFinished = true;
          if (isSettled) return;
          finishedCount++;
          if (finishedCount >= candidates.length)
            settle(bestMatch, 'Consensus reached');
        });
    }
  });
}

async function searchOnSoundCloud(
  query: string,
  targetMetadata?: { duration: number }
): Promise<SearchResult | null> {
  try {
    const soundCloudModule =
      (await import('../extractors/soundcloud.js')) as unknown as SoundCloudService;
    const searchResults = await soundCloudModule.search(query);
    if (!searchResults?.length) return null;

    const info = await soundCloudModule.getInfo(searchResults[0].permalink_url);
    const targetDurationMs = targetMetadata?.duration ?? 0;
    const drift =
      targetDurationMs > 0
        ? Math.abs((info.duration || 0) * 1000 - targetDurationMs)
        : 0;

    return { url: searchResults[0].permalink_url, info, diff: drift };
  } catch (error: unknown) {
    console.error(
      `[Race] SoundCloud search failed: ${(error as Error).message}`
    );
    return null;
  }
}

export async function runPriorityRace(
  videoURL: string,
  metadata: {
    title: string;
    artist: string;
    duration: number;
    isrc?: string;
    album?: string;
    year?: string | number;
    imageUrl?: string;
  },
  cookieArgs: string[],
  onProgress: (
    stage: string,
    progress: number,
    message?: string,
    details?: string
  ) => void,
  soundchartsPromise: Promise<{ isrc?: string } | null> | null = null
): Promise<MatchResult | null> {
  const startTime = Date.now();
  const getElapsed = (): string => ((Date.now() - startTime) / 1000).toFixed(1);
  const candidates: Array<{
    type: string;
    priority: number;
    promise: Promise<SearchResult | null>;
    isFinished?: boolean;
  }> = [];
  const raceController = new AbortController();
  const { signal } = raceController;
  let raceSettled = false;

  onProgress('initializing', 25, 'Staging Multi-Source Search...');

  const isrcPromise = (async (): Promise<SearchResult | null> => {
    if (raceSettled) return null;
    let isrc: string | null | undefined =
      metadata.isrc ??
      (soundchartsPromise ? (await soundchartsPromise)?.isrc : null);

    if (!isrc) {
      const results = await Promise.race([
        Promise.all([
          fetchIsrcFromDeezer(
            metadata.title,
            metadata.artist,
            null,
            metadata.duration
          ).catch(() => null),
          fetchIsrcFromItunes(
            metadata.title,
            metadata.artist,
            null,
            metadata.duration
          ).catch(() => null),
        ]),
        new Promise<null[]>((resolve) =>
          setTimeout(() => resolve([null, null]), 3000)
        ),
      ]);
      isrc = results?.[0]?.isrc ?? results?.[1]?.isrc;
    }

    if (!isrc || raceSettled) return null;
    onProgress('initializing', 35, 'Running ISRC Quantum Matcher...');
    return searchOnYoutube(
      `"${isrc}"`,
      cookieArgs,
      metadata,
      null,
      true,
      signal
    );
  })();
  candidates.push({ type: 'ISRC', priority: 0, promise: isrcPromise });

  const soundcloudPromise = (async (): Promise<SearchResult | null> => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (raceSettled) return null;
    onProgress('initializing', 40, 'Scanning SoundCloud Catalog...');
    return searchOnSoundCloud(`${metadata.title} ${metadata.artist}`, metadata);
  })();
  candidates.push({
    type: 'SoundCloud',
    priority: 1,
    promise: soundcloudPromise,
  });

  const odesliPromise = (async (): Promise<SearchResult | null> => {
    if (!videoURL || raceSettled) return null;
    onProgress('initializing', 45, 'Consulting Odesli API...');
    const response = await fetchFromOdesli(videoURL).catch(() => null);
    if (!response?.targetUrl || raceSettled) return null;

    const ytdlp = await getYtdlpService();
    const info = await ytdlp
      .getVideoInfo(response.targetUrl, cookieArgs, false, signal)
      .catch(() => null);
    if (!info) return null;

    return {
      url: response.targetUrl,
      info,
      diff: Math.abs((info.duration || 0) * 1000 - metadata.duration),
    };
  })();
  candidates.push({ type: 'Odesli', priority: 1, promise: odesliPromise });

  const aiPromise = (async (): Promise<SearchResult | null> => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (raceSettled) return null;
    onProgress('initializing', 55, 'Refining Search with AI...');
    const aiResult = await refineSearchWithAI({
      ...metadata,
      album: metadata.album || 'Unknown',
      year: metadata.year as string | number,
    }).catch(() => null);
    if (!aiResult?.query || raceSettled) return null;
    return searchOnYoutube(
      aiResult.query,
      cookieArgs,
      metadata,
      null,
      false,
      signal
    );
  })();
  candidates.push({ type: 'AI', priority: 2, promise: aiPromise });

  const artistCleaningRegex = /\s+(?:Music|Band|Official|Topic|TV)\s*$/iu;
  const cleanArtist = metadata.artist.replace(artistCleaningRegex, '').trim();
  if (cleanArtist) {
    const cleanPromise = (async (): Promise<SearchResult | null> => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (raceSettled) return null;
      onProgress('initializing', 65, 'Performing Deep Catalog Search...');
      return searchOnYoutube(
        `${metadata.title} ${cleanArtist}`,
        cookieArgs,
        metadata,
        null,
        false,
        signal
      );
    })();
    candidates.push({ type: 'Clean', priority: 2, promise: cleanPromise });
  }

  const raceTimeoutId = setTimeout(() => {
    if (!raceSettled) raceController.abort();
  }, 45000);

  try {
    const bestMatch = await priorityRace(
      candidates,
      metadata,
      onProgress,
      getElapsed,
      (_reason: string) => {
        raceSettled = true;
        raceController.abort();
        clearTimeout(raceTimeoutId);
        onProgress('initializing', 80, 'Race Completed.');
      }
    );
    const [isrcResult] = await Promise.all([
      isrcPromise.catch(() => null),
      resolveSideTasks(videoURL, metadata).catch(() => null),
    ]);

    if (
      isrcResult &&
      (!bestMatch || (bestMatch.type !== 'ISRC' && isrcResult.diff <= 2000))
    ) {
      return { ...isrcResult, type: 'ISRC', priority: 0 };
    }

    if (!bestMatch) throw new Error('No high-quality YouTube matches found.');
    return bestMatch;
  } catch (error) {
    raceSettled = true;
    raceController.abort();
    clearTimeout(raceTimeoutId);
    throw error;
  }
}
