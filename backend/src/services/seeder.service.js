const { resolveSpotifyToYoutube, saveToBrain } = require("./spotify.service");
const { getVideoInfo } = require("./ytdlp.service");
const { processVideoFormats, processAudioFormats } = require("../utils/format.util");
const { sendEvent } = require("../utils/sse.util");

async function resolveAndSaveTrack(track, clientId) {
    const trackId = track.id || (track.uri && track.uri.includes(":track:") ? track.uri.split(":").pop() : null) || (track.url && track.url.includes("track/") ? track.url.split("track/").pop().split("?")[0] : null);
    const trackUrl = track.external_urls?.spotify || track.url || (trackId ? `https://open.spotify.com/track/${trackId}` : null);

    if (!trackUrl) {
        console.warn(`[Seeder] Could not resolve URL for: "${track.name || "Unknown"}"`);
        return false;
    }

    console.log(`[Seeder] Analyzing: "${track.name || "Unknown"}"`);

    const result = await resolveSpotifyToYoutube(trackUrl, [], (status, progress, data) => {
        if (clientId) sendEvent(clientId, {
            status: "seeding",
            subStatus: `Scanning: "${track.name} by ${track.artists?.[0]?.name || "Unknown"}"`,
            details: data.details
        });
    });

    if (result && result.isIsrcMatch && !result.fromBrain) {
        const info = await getVideoInfo(result.targetUrl);
        await saveToBrain(trackUrl, {
            ...result,
            cover: result.imageUrl,
            formats: processVideoFormats(info),
            audioFormats: processAudioFormats(info)
        });
        console.log(`[Seeder] [OK] "${track.name}" locked into Permanent Memory.`);
        return true;
    }

    const reason = result?.fromBrain ? "Already in Brain" : "No ISRC match found";
    console.log(`[Seeder] [SKIP] "${track.name}" (${reason})`);
    return false;
}

async function processBackgroundTracks(tracks, clientId) {
    let successCount = 0;
    let skipCount = 0;

    console.log(`[Seeder] Background Queue Started. Tracks to process: ${tracks.length}`);

    for (const track of tracks) {
        try {
            const saved = await resolveAndSaveTrack(track, clientId);
            if (saved) successCount++;
            else skipCount++;
            await new Promise(r => setTimeout(r, 5000));
        } catch (error) {
            console.error(`[Seeder] [ERROR] Track processing failed:`, error.message);
        }
    }
    console.log(`[Seeder] MISSION COMPLETED. Added: ${successCount} | Skipped: ${skipCount}`);
}

module.exports = {
    processBackgroundTracks
};
