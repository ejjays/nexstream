import { getInfo as getYtInfo, getStream as getYtStream } from './youtube/index.js';
import { VideoInfo, ExtractorOptions } from '../../types/index.js';
import { Readable } from 'node:stream';

type SpotifyData = {
  targetUrl: string;
  youtubeUrl?: string;
  fromBrain?: boolean;
  formats?: any[];
  imageUrl?: string;
  cover?: string;
  thumbnail?: string;
  duration?: number;
  isrc?: string;
  title?: string;
  artist?: string;
  album?: string;
  previewUrl?: string;
  [key: string]: any;
};

interface SpotifyService {
  resolveSpotifyToYoutube(
    url: string,
    ids: string[],
    onProgress: (status: string, progress: number, extra: any) => void
  ): Promise<SpotifyData>;
}

async function getSpotifyService(): Promise<SpotifyService> {
  const spotifyModule: any = await import('../spotify/index.js');

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
  const resolvedYoutubeUrl = spotifyData.targetUrl || spotifyData.youtubeUrl;
  
  return {
    ...(spotifyData as unknown as VideoInfo),
    type: 'video',
    targetUrl: resolvedYoutubeUrl,
    cover: spotifyData.imageUrl || (spotifyData.cover as string),
    thumbnail: (spotifyData.imageUrl || spotifyData.thumbnail || '') as string,
    
    duration: (spotifyData.duration || 0) / 1000,
    extractorKey: 'spotify',
    isJsInfo: true,
    fromBrain: true,
    isPartial: false,
    isIsrcMatch: true,
    isFullData: true
  };
}

function mapToJsResult(url: string, spotifyData: SpotifyData, ytInfo: VideoInfo): VideoInfo {
  return {
    ...ytInfo,
    type: 'video',
    id: ytInfo.id,
    isrc: spotifyData.isrc || undefined,
    extractorKey: 'spotify',
    title: spotifyData.title || ytInfo.title,
    artist: spotifyData.artist || ytInfo.artist || "Unknown Artist",
    uploader: spotifyData.artist || ytInfo.uploader || "Unknown Uploader",
    album: spotifyData.album || '',
    imageUrl: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    cover: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    thumbnail: spotifyData.cover || spotifyData.imageUrl || ytInfo.thumbnail,
    previewUrl: spotifyData.previewUrl || null,
    webpageUrl: url,
    targetUrl: spotifyData.targetUrl,
    isJsInfo: true,
    fromBrain: false,
    isPartial: false,
    isIsrcMatch: false,
    isFullData: false
  };
}

// spotify js extractor
export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo> {
  const spotifyService = await getSpotifyService();

  const spotifyData: SpotifyData = await spotifyService.resolveSpotifyToYoutube(
    url,
    [],
    (status: string, progress: number, extra: any) => {
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
    const liveYtInfo = await getYtInfo(videoInfo.targetUrl || '');
    return getYtStream(liveYtInfo, options);
  }
  return getYtStream(videoInfo, options);
}
