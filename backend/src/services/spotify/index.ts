import { getFromBrain, saveToBrain, updatePreviewInBrain } from "./brain.js";
import { fetchInitialMetadata, fetchPreviewUrlManually } from "./metadata.js";
import { fetchIsrcFromDeezer } from "./external.js";
import { runPriorityRace } from "./resolver.js";

interface BrainData {
  previewUrl?: string;
  preview_url?: string;
  title: string;
  artist: string;
  isrc?: string;
  duration: number;
  formats?: unknown[];
  audioFormats?: unknown[];
  youtubeUrl?: string;
  imageUrl?: string;
}

type OnProgressFn = (phase: string, progress: number, message?: string, extra?: string) => void;

interface CachedEntry {
  data: any;
  timestamp: number;
}

const RESOLUTION_CACHE = new Map<string, CachedEntry>();
const RESOLUTION_EXPIRY = 60 * 60 * 1000;

export async function refreshPreviewIfNeeded(
  cleanUrl: string,
  brainData: any,
  onProgress: any = () => {},
): Promise<void> {
  const currentPreview = brainData.previewUrl || brainData.preview_url;
  const isExpiringCDN = currentPreview?.includes('scdn.co') ||
                        currentPreview?.includes('spotify') ||
                        currentPreview?.includes('dzcdn.net') ||
                        currentPreview?.includes('mzstatic.com') ||
                        currentPreview?.includes('itunes.apple.com');

  if (currentPreview && !isExpiringCDN) return;

  try {
    onProgress("initializing", 20, "Refreshing 30s preview...");

    let fresh = await fetchPreviewUrlManually(cleanUrl);
    let freshIsrc: string | null = null;

    if (!fresh) {
      const dData = await fetchIsrcFromDeezer(
        brainData.title,
        brainData.artist,
        (brainData.isrc && brainData.isrc !== 'NONE') ? brainData.isrc : null,
        brainData.duration,
      );
      fresh = dData?.preview || null;
      freshIsrc = dData?.isrc || null;
    }

    if (fresh) {
      brainData.previewUrl = fresh;
      brainData.preview_url = fresh;
      if (freshIsrc && (!brainData.isrc || brainData.isrc === 'NONE')) {
        brainData.isrc = freshIsrc;
      }
      onProgress(
        "initializing",
        20,
        undefined,
        JSON.stringify({ metadata_update: { previewUrl: fresh, isrc: brainData.isrc } }),
      );
      updatePreviewInBrain(cleanUrl, fresh).catch(() => {});
    }
  } catch (error: any) {
    console.debug('[SpotifyIndex] Preview refresh error:', error.message);
  }
}

export async function resolveSpotifyToYoutube(
  videoURL: string,
  cookieArgs: string[] = [],
  onProgress: any = () => {},
): Promise<any> {
  if (!videoURL.includes("spotify.com")) return { targetUrl: videoURL };

  const cleanUrl = videoURL.split("?")[0];

  if (RESOLUTION_CACHE.has(cleanUrl)) {
    const cached = RESOLUTION_CACHE.get(cleanUrl);
    if (cached && Date.now() - cached.timestamp < RESOLUTION_EXPIRY) {
      return cached.data;
    }
  }

  const cachedBrain: any = await getFromBrain(cleanUrl);
  if (cachedBrain && typeof cachedBrain === 'object') {
    const brainData: any = {
      ...cachedBrain,
      fromBrain: true,
    };

    if (brainData.formats?.length) {
      onProgress(
        "initializing",
        95,
        "Synchronizing with Global Registry...",
        JSON.stringify({
          metadata_update: {
            ...brainData,
            cover: brainData.imageUrl,
            thumbnail: brainData.imageUrl,
            duration: brainData.duration / 1000,
            isFullData: true,
            isPartial: false,
          },
        }),
      );
      await refreshPreviewIfNeeded(cleanUrl, brainData, onProgress);
      return brainData;
    }
  }

  const startTime = Date.now();
  const { metadata, soundchartsPromise } = await fetchInitialMetadata(videoURL, onProgress, startTime);
  await refreshPreviewIfNeeded(cleanUrl, metadata, onProgress);

  const bestMatch: any = await runPriorityRace(
    videoURL,
    metadata as any,
    cookieArgs,
    onProgress,
    soundchartsPromise,
  );
  if (!bestMatch?.url) throw new Error("No match found.");

  const finalData = {
    ...metadata,
    targetUrl: bestMatch.url,
    isIsrcMatch: bestMatch.type === "ISRC" || bestMatch.type === "Soundcharts",
    previewUrl: metadata.previewUrl,
  };

  RESOLUTION_CACHE.set(cleanUrl, { data: finalData, timestamp: Date.now() });
  return finalData;
}

export { saveToBrain, fetchIsrcFromDeezer };
