import { logExtractionSteps } from '../../utils/api/controller.util.js';
import { getVideoInfo } from '../ytdlp.service.js';
import { saveToBrain } from '../spotify.service.js';
import { VideoInfo, SpotifyMetadata, FinalResponse } from '../../types/index.js';

export async function fetchMediaInfo(
  videoURL: string,
  clientId: string | undefined,
  serviceName: string,
  cookieArgs: string[]
): Promise<VideoInfo | null> {
  if (clientId) await logExtractionSteps(clientId, serviceName, 1);

  const info: VideoInfo | null = await getVideoInfo(
    videoURL,
    cookieArgs,
    false,
    null,
    clientId
  ).catch((error: unknown) => {
    console.error('[VideoInfo] Extraction failed:', (error as Error).message);
    return null;
  });

  if (clientId) await logExtractionSteps(clientId, serviceName, 3);
  return info;
}

export function handleSpotifyRegistry(
  info: VideoInfo,
  finalResponse: FinalResponse,
  videoURL: string,
  targetURL: string
) {
  if (info.fromBrain || !info.isJsInfo || !info.isIsrcMatch) return;

  console.log(
    `[Registry] Saving new mapping for: ${info.title} (ISRC: ${info.isrc})`
  );
  saveToBrain(videoURL, {
    ...info,
    cover: finalResponse.cover,
    formats: finalResponse.formats,
    audioFormats: finalResponse.audioFormats,
    targetUrl: targetURL,
  } as unknown as SpotifyMetadata);
}
