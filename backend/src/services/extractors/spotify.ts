import { getInfo as getYtInfo, getStream as getYtStream } from './youtube/index.js';
import { VideoInfo, ExtractorOptions } from '../../types/index.js';
import { Readable } from 'node:stream';

type SpotifyData = {
  targetUrl: string;
  youtubeUrl?: string;
  target_url?: string;
  fromBrain?: boolean;
  formats?: unknown[];
  imageUrl?: string;
  cover?: string;
  thumbnail?: string;
  duration?: number;
  isrc?: string;
  title?: string;
  artist?: string;
  album?: string;
  previewUrl?: string;
  [key: string]: unknown;
};

interface SpotifyService {
  resolveSpotifyToYoutube(
    url: string,
    ids: string[],
    onProgress: (status: string, progress: number, extra: unknown) => void
  ): Promise<SpotifyData>;
}

async function getSpotifyService(): Promise<SpotifyService> {
  const spotifyModule: unknown = await import('../spotify/index.js');

  if (
    !spotifyModule ||
    typeof (spotifyModule as Partial<SpotifyService>).resolveSpotifyToYoutube !== 'function'
  ) {
    console.error('[JS-Spotify] Circular dependency error');
    throw new Error('Service initialization error.');
  }
  
  return spotifyModule as SpotifyService;
}

function mapToBrainResult(spotifyData: SpotifyData): VideoInfo {
  const resolvedYoutubeUrl = spotifyData.targetUrl || spotifyData.youtubeUrl || spotifyData.target_url;
  
  return {
    ...(spotifyData as unknown as VideoInfo),
    cover: spotifyData.imageUrl || (spotifyData.cover as string),
    thumbnail: (spotifyData.imageUrl || spotifyData.thumbnail || '') as string,
    target_url: resolvedYoutubeUrl,
    targetUrl: resolvedYoutubeUrl,
    duration: (spotifyData.duration || 0) / 1000,
    extractor_key: 'spotify',
    is_spotify: true,
    is_js_info: true,
    fromBrain: true
  };
}

function mapToJsResult(url: string, spotifyData: SpotifyData, ytInfo: VideoInfo): VideoInfo {
  return {
    ...ytInfo,
    id: ytInfo.id,
    isrc: spotifyData.isrc || null,
    extractor_key: 'spotify',
    title: spotifyData.title || ytInfo.title,
    artist: spotifyData.artist || ytInfo.author,
    uploader: spotifyData.artist || ytInfo.author,
    album: spotifyData.album || '',
    imageUrl: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    cover: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    thumbnail: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    previewUrl: spotifyData.previewUrl || null,
    webpage_url: url,
    target_url: spotifyData.targetUrl,
    targetUrl: spotifyData.targetUrl,
    is_spotify: true,
    is_js_info: true
  } as VideoInfo;
}

// spotify js extractor
export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo> {
  const spotifyService = await getSpotifyService();

  const spotifyData: SpotifyData = await spotifyService.resolveSpotifyToYoutube(
    url,
    [],
    (status: string, progress: number, extra: unknown) => {
      if (options.onProgress) options.onProgress(status, progress, typeof extra === 'string' ? extra : undefined);
    }
  );

  if (!spotifyData?.targetUrl) {
    throw new Error('Failed to resolve Spotify track to YouTube.');
  }

  if (spotifyData.fromBrain && (spotifyData.formats?.length ?? 0) > 0) {
    return mapToBrainResult(spotifyData);
  }

  const ytInfo = await getYtInfo(spotifyData.targetUrl);
  return mapToJsResult(url, spotifyData, ytInfo);
}

export async function getStream(videoInfo: VideoInfo, options: ExtractorOptions = {}): Promise<Readable> {
  // refresh expired urls
  if (videoInfo.fromBrain) {
    const liveYtInfo = await getYtInfo(videoInfo.target_url || videoInfo.targetUrl || '');
    return getYtStream(liveYtInfo, options);
  }
  return getYtStream(videoInfo, options);
}
