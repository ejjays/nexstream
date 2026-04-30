import { resolveSpotifyToYoutube, saveToBrain } from "./spotify.service.js";
import { getVideoInfo } from "./ytdlp.service.js";
import {
  processVideoFormats,
  processAudioFormats,
} from "../utils/format.util.js";
import { sendEvent } from "../utils/sse.util.js";

async function resolveAndSaveTrack(track: any, clientId: string | undefined): Promise<boolean> {
  const trackId =
    track.id ||
    (track.uri && track.uri.includes(":track:")
      ? track.uri.split(":").pop()
      : null) ||
    (track.url && track.url.includes("track/")
      ? track.url.split("track/").pop().split("?")[0]
      : null);
  const trackUrl =
    track.external_urls?.spotify ||
    track.url ||
    (trackId ? `https://open.spotify.com/track/${trackId}` : null);

  if (!trackUrl) {
    console.warn(
      `[Seeder] Could not resolve URL for: "${track.name || "Unknown"}"`,
    );
    return false;
  }

  console.log(`[Seeder] Analyzing: "${track.name || "Unknown"}"`);

  const result = await resolveSpotifyToYoutube(
    trackUrl,
    [],
    (status: any, progress: number, data: any) => {
      if (clientId)
        sendEvent(clientId, {
          status: "seeding",
          subStatus: `Scanning: "${track.name} by ${track.artists?.[0]?.name || "Unknown"}"`,
          details: data?.details,
        });
    },
  );

  if (result && result.isIsrcMatch && !result.fromBrain) {
    const info = await getVideoInfo(result.targetUrl);
    await saveToBrain(trackUrl, {
      ...result,
      cover: result.imageUrl,
      formats: processVideoFormats(info),
      audioFormats: processAudioFormats(info),
    });
    console.log(`[Seeder] [OK] "${track.name}" locked into Permanent Memory.`);
    return true;
  }

  const reason = result?.fromBrain ? "Already in Brain" : "No ISRC match found";
  console.log(`[Seeder] [SKIP] "${track.name}" (${reason})`);
  return false;
}

export async function processBackgroundTracks(tracks: any[], clientId: string | undefined): Promise<void> {
  let successCount = 0;
  let skipCount = 0;

  console.log(
    `[Seeder] Background Queue Started. Tracks to process: ${tracks.length}`,
  );

  for (const track of tracks) {
    try {
      const saved = await resolveAndSaveTrack(track, clientId);
      if (saved) successCount++;
      else skipCount++;
      await new Promise((r) => setTimeout(r, 5000));
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`[Seeder] [ERROR] Track processing failed:`, err.message);
    }
  }
  console.log(
    `[Seeder] MISSION COMPLETED. Added: ${successCount} | Skipped: ${skipCount}`,
  );
}
