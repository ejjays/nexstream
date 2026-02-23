const { getFromBrain, saveToBrain } = require("./brain");
const { fetchInitialMetadata, fetchPreviewUrlManually } = require("./metadata");
const { fetchIsrcFromDeezer, fetchIsrcFromItunes } = require("./external");
const { runPriorityRace } = require("./resolver");

const RESOLUTION_CACHE = new Map();
const RESOLUTION_EXPIRY = 15000;

async function refreshPreviewIfNeeded(cleanUrl, brainData) {
  try {
    let fresh = await fetchPreviewUrlManually(cleanUrl);
    if (!fresh) {
      const dData = await fetchIsrcFromDeezer(
        brainData.title,
        brainData.artist,
        brainData.isrc,
        brainData.duration,
      );
      fresh = dData?.preview;
    }
    if (!fresh) {
      const iData = await fetchIsrcFromItunes(
        brainData.title,
        brainData.artist,
        brainData.isrc,
        brainData.duration,
      );
      fresh = iData?.preview;
    }
    if (fresh) brainData.previewUrl = fresh;
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
      await refreshPreviewIfNeeded(cleanUrl, brainData);
      return brainData;
    }
  }

  if (RESOLUTION_CACHE.has(videoURL)) {
    const cached = RESOLUTION_CACHE.get(videoURL);
    if (Date.now() - cached.timestamp < RESOLUTION_EXPIRY) {
      onProgress("fetching_info", 90, { subStatus: "Found in local cache." });
      return cached.data;
    }
  }

  const startTime = Date.now();
  const { metadata, soundchartsPromise } = await fetchInitialMetadata(
    videoURL,
    onProgress,
    startTime,
  );

  fetchPreviewUrlManually(videoURL)
    .then((previewUrl) => {
      if (previewUrl) {
        onProgress("fetching_info", 20, { metadata_update: { previewUrl } });
        metadata.previewUrl = previewUrl;
      }
    })
    .catch(() => {});

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

  RESOLUTION_CACHE.set(videoURL, { data: finalData, timestamp: Date.now() });
  return finalData;
}

module.exports = {
  resolveSpotifyToYoutube,
  fetchIsrcFromDeezer,
  saveToBrain,
};
