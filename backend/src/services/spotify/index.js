const { getFromBrain, saveToBrain, updatePreviewInBrain } = require("./brain");
const { fetchInitialMetadata, fetchPreviewUrlManually } = require("./metadata");
const { fetchIsrcFromDeezer, fetchIsrcFromItunes } = require("./external");
const { runPriorityRace } = require("./resolver");

const RESOLUTION_CACHE = new Map();
const RESOLUTION_EXPIRY = 60 * 60 * 1000; // one hour cache

async function refreshPreviewIfNeeded(cleanUrl, brainData, onProgress = () => {}) {
  // refresh expired previews
  const isSpotifyPreview = brainData.previewUrl?.includes('scdn.co') || brainData.previewUrl?.includes('spotify');
  
  if (brainData.previewUrl && !isSpotifyPreview) return;
  
  try {
    console.log(`[Preview] JIT Refresh: "${brainData.title}"`);
    onProgress("fetching_info", 20, { subStatus: "Refreshing 30s preview..." });
    
    let fresh = await fetchPreviewUrlManually(cleanUrl);
    let freshIsrc = null;
    
    const cleanIsrc = (brainData.isrc && brainData.isrc !== 'NONE') ? brainData.isrc : null;

    if (!fresh) {
      const dData = await fetchIsrcFromDeezer(
        brainData.title,
        brainData.artist,
        cleanIsrc,
        brainData.duration,
      );
      fresh = dData?.preview;
      freshIsrc = dData?.isrc;
    }
    if (!fresh) {
      const iData = await fetchIsrcFromItunes(
        brainData.title,
        brainData.artist,
        cleanIsrc,
        brainData.duration,
      );
      fresh = iData?.preview;
      freshIsrc = iData?.isrc;
    }
    
    if (fresh) {
       console.log(`[Preview] Success: "${brainData.title}"`);
       brainData.previewUrl = fresh;
       
       // keep recovered isrc
       if (freshIsrc && (!brainData.isrc || brainData.isrc === 'NONE')) {
         console.log(`[Preview] ISRC Recovered: ${freshIsrc}`);
         brainData.isrc = freshIsrc;
       }

       onProgress("fetching_info", 20, { metadata_update: { previewUrl: fresh, isrc: brainData.isrc } });
       
       // update registry brain
       updatePreviewInBrain(cleanUrl, fresh).catch(() => {});
    }
  } catch (error) {}
}

async function resolveSpotifyToYoutube(
  videoURL,
  cookieArgs = [],
  onProgress = () => {},
) {
  if (!videoURL.includes("spotify.com")) return { targetUrl: videoURL };
  if (!videoURL.includes("/track/"))
    throw new Error("Only direct Spotify track links supported.");

  const cleanUrl = videoURL.split("?")[0];
  
  // check local cache
  if (RESOLUTION_CACHE.has(cleanUrl)) {
    const cached = RESOLUTION_CACHE.get(cleanUrl);
    if (Date.now() - cached.timestamp < RESOLUTION_EXPIRY) {
      console.log(`[Spotify] Cache Hit: ${cached.data.title}`);
      onProgress("fetching_info", 90, { subStatus: "Found in local cache." });
      return cached.data;
    }
  }

  // check turso brain
  const cachedBrain = await getFromBrain(cleanUrl);
  if (cachedBrain) {
    const brainData = {
      ...cachedBrain,
      imageUrl: cachedBrain.imageUrl || "/logo.webp",
      formats: JSON.parse(cachedBrain.formats || "[]"),
      audioFormats: JSON.parse(cachedBrain.audioFormats || "[]"),
      audioFeatures: JSON.parse(cachedBrain.audioFeatures || "null"),
      targetUrl: cachedBrain.youtubeUrl,
      fromBrain: true,
    };
    if (brainData.formats?.length) {
      onProgress("fetching_info", 95, {
        subStatus: "Synchronizing with Global Registry...",
        details: `REGISTRY_HIT: ${brainData.isrc || "LOCAL_CACHE"}`,
        metadata_update: {
          ...brainData,
          cover: brainData.imageUrl,
          thumbnail: brainData.imageUrl,
          duration: brainData.duration / 1000,
          isFullData: true,
        },
      });
      await refreshPreviewIfNeeded(cleanUrl, brainData, onProgress);
      return brainData;
    }
  }

  // run quantum race
  const startTime = Date.now();
  const { metadata, soundchartsPromise } = await fetchInitialMetadata(
    videoURL,
    onProgress,
    startTime,
  );

  // await preview refresh
  await refreshPreviewIfNeeded(cleanUrl, metadata, onProgress);

  const bestMatch = await runPriorityRace(
    videoURL,
    metadata,
    cookieArgs,
    onProgress,
    soundchartsPromise,
  );
  if (!bestMatch?.url) throw new Error("No match found.");

  const finalData = {
    ...metadata,
    targetUrl: bestMatch.url,
    isIsrcMatch: !!(
      bestMatch.type === "ISRC" || bestMatch.type === "Soundcharts"
    ),
    previewUrl: metadata.previewUrl,
  };

  RESOLUTION_CACHE.set(cleanUrl, { data: finalData, timestamp: Date.now() });
  return finalData;
}

module.exports = {
  resolveSpotifyToYoutube,
  fetchIsrcFromDeezer,
  saveToBrain,
};
