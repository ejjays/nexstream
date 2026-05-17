import * as youtube from './youtube/index.js';
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
  [key: string]: unknown;
};

interface SpotifyService {
  resolveSpotifyToYoutube(
    url: string,
    ids: string[],
    onProgress: (status: unknown, progress: number, extra: unknown) => void
  ): Promise<SpotifyData>;
}

// spotify js extractor
export async function getInfo(url: string, options: ExtractorOptions = {}): Promise<VideoInfo> {
  // break circular dep
  const spotifyModule: unknown = await import('../spotify/index.js');

  if (
    !spotifyModule ||
    typeof (spotifyModule as Partial<SpotifyService>).resolveSpotifyToYoutube !== 'function'
  ) {
     console.error('[JS-Spotify] Circular dependency error');
     throw new Error('Service initialization error.');
  }
  
  const spotifyService = spotifyModule as SpotifyService;

  // resolve spotify track
  const startResolve = Date.now();
  const spotifyData: SpotifyData = await spotifyService.resolveSpotifyToYoutube(
    url,
    [],
    (status: unknown, progress: number, extra: unknown) => {
      if (options.onProgress) options.onProgress(status as any, progress, extra as any);
    }
  );
  
  const duration = ((Date.now() - startResolve) / 1000).toFixed(2);
  console.log(`[JS-Spotify] Resolved "${url}" in ${duration}s`);

  if (!spotifyData || !spotifyData.targetUrl) {
    throw new Error('Failed to resolve Spotify track to YouTube.');
  }

  // check turso brain
  if (spotifyData.fromBrain && (spotifyData.formats?.length ?? 0) > 0) {
    const resolvedYoutubeUrl = spotifyData.targetUrl || spotifyData.youtubeUrl || spotifyData.target_url;
    
    const result: VideoInfo = {
      ...spotifyData as any,
      cover: spotifyData.imageUrl || (spotifyData.cover as string),
      thumbnail: (spotifyData.imageUrl || spotifyData.thumbnail || '') as string,
      target_url: resolvedYoutubeUrl,
      targetUrl: resolvedYoutubeUrl,
      duration: (spotifyData.duration as any) / 1000,
      extractor_key: 'spotify',
      is_spotify: true,
      is_js_info: true,
      fromBrain: true
    };
    return result;
  }

  // js info extraction
  const ytInfo = await youtube.getInfo(spotifyData.targetUrl);
  
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

export async function getStream(videoInfo: VideoInfo, options: ExtractorOptions = {}): Promise<Readable> {
  // refresh expired urls
  if (videoInfo.fromBrain) {
    const liveYtInfo = await youtube.getInfo(videoInfo.target_url || videoInfo.targetUrl || '');
    return youtube.getStream(liveYtInfo, options);
  }
  return youtube.getStream(videoInfo, options);
}
