const fetch = require("isomorphic-unfetch");
const { getData, getDetails } = require("spotify-url-info")(fetch);
const cheerio = require("cheerio");
const axios = require("axios");
const { extractTrackId } = require("../../utils/validation.util");

const SOUNDCHARTS_APP_ID = process.env.SOUNDCHARTS_APP_ID;
const SOUNDCHARTS_API_KEY = process.env.SOUNDCHARTS_API_KEY;
const soundchartsMetadataCache = new Map();

async function fetchFromSoundcharts(spotifyUrl) {
  try {
    const trackId = extractTrackId(spotifyUrl);
    if (!trackId) return null;

    if (soundchartsMetadataCache.has(trackId)) {
      const cached = soundchartsMetadataCache.get(trackId);
      if (Date.now() - cached.timestamp < 86400000) return cached.data;
    }

    const safeId = trackId.replace(/[^a-zA-Z0-9]/g, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `https://customer.api.soundcharts.com/api/v2.25/song/by-platform/spotify/${safeId}`,
      {
        headers: {
          "x-app-id": SOUNDCHARTS_APP_ID,
          "x-api-key": SOUNDCHARTS_API_KEY,
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.object) return null;

    const obj = data.object;
    const result = {
      title: obj.name,
      artist: obj.artists?.[0]?.name || "Unknown Artist",
      album: obj.labels?.[0]?.name || "",
      imageUrl: obj.imageUrl,
      duration: (obj.duration || 0) * 1000,
      isrc: obj.isrc?.value || "",
      audioFeatures: obj.audio || null,
      year: obj.releaseDate ? obj.releaseDate.split("-")[0] : "Unknown",
      previewUrl:
        obj.previewUrl ||
        obj.audioPreviewUrl ||
        obj.spotify?.previewUrl ||
        obj.preview_url ||
        null,
      source: "soundcharts",
    };

    soundchartsMetadataCache.set(trackId, {
      data: result,
      timestamp: Date.now(),
    });
    return result;
  } catch (err) {
    return null;
  }
}

async function fetchFromScrapers(videoURL) {
  const trackId = extractTrackId(videoURL);
  if (!trackId) return null;
  const safeUrl = `https://open.spotify.com/track/${trackId}`;

  try {
    let details = null;
    try {
      details = await getData(safeUrl);
    } catch (e) {}
    if (!details) {
      try {
        details = await getDetails(safeUrl);
      } catch (e) {}
    }
    if (!details) {
      try {
        const oembedRes = await fetch(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(safeUrl)}`,
        );
        const oembedData = await oembedRes.json();
        if (oembedData) {
          details = {
            name: oembedData.title,
            artists: [{ name: "Unknown Artist" }],
          };
        }
      } catch (e) {}
    }
    if (!details) return null;

    return {
      title:
        details.name ||
        details.preview?.title ||
        details.title ||
        "Unknown Title",
      artist:
        (details.artists && details.artists[0]?.name) ||
        details.preview?.artist ||
        details.artist ||
        "Unknown Artist",
      album:
        (details.album && details.album.name) ||
        details.preview?.album ||
        details.album ||
        "",
      imageUrl:
        (details.visualIdentity?.image &&
          details.visualIdentity.image[details.visualIdentity.image.length - 1]
            ?.url) ||
        (details.coverArt?.sources &&
          details.coverArt.sources[details.coverArt.sources.length - 1]?.url) ||
        details.preview?.image ||
        details.image ||
        details.thumbnail_url ||
        "",
      duration:
        details.duration_ms ||
        details.duration ||
        details.preview?.duration_ms ||
        0,
      year:
        (typeof details.releaseDate === "string" &&
          details.releaseDate.split("-")[0]) ||
        (typeof details.release_date === "string" &&
          details.release_date.split("-")[0]) ||
        "Unknown",
      isrc:
        details.external_ids?.isrc ||
        details.isrc ||
        details.preview?.isrc ||
        "",
      previewUrl:
        details.preview_url ||
        details.audio_preview_url ||
        details.preview?.audio_url ||
        (details.tracks && details.tracks[0]?.preview_url) ||
        null,
      source: "scrapers",
    };
  } catch (err) {
    return null;
  }
}

async function fetchInitialMetadata(videoURL, onProgress, startTime) {
  onProgress("fetching_info", 10, {
    subStatus: "Fetching metadata...",
    details: "METADATA: INITIATING_MULTI_SOURCE_SCAN",
  });
  const soundchartsPromise = fetchFromSoundcharts(videoURL).catch((e) => {
    console.error("[Metadata] Soundcharts failed:", e.message);
    return null;
  });
  const scrapersPromise = fetchFromScrapers(videoURL)
    .then((res) => {
      if (res?.previewUrl && onProgress) {
        console.log(
          `[Quantum Race] [+${((Date.now() - startTime) / 1000).toFixed(1)}s] Scraper found Preview URL. Dispatching...`,
        );
        onProgress("fetching_info", 20, {
          metadata_update: {
            previewUrl: res.previewUrl,
          },
        });
      }
      return res;
    })
    .catch((e) => {
      console.error("[Metadata] Scrapers failed:", e.message);
      return null;
    });
  const firstMetadata = await Promise.any([
    soundchartsPromise.then(
      (res) => res || Promise.reject(new Error("No Soundcharts")),
    ),
    scrapersPromise.then(
      (res) => res || Promise.reject(new Error("No Scrapers")),
    ),
  ]).catch(() => null);
  if (!firstMetadata) {
    throw new Error("Metadata fetch failed: All providers returned null");
  }
  console.log(
    `[Quantum Race] [+${((Date.now() - startTime) / 1000).toFixed(1)}s] Metadata Locked & Dispatched.`,
  );
  onProgress("fetching_info", 20, {
    subStatus: "Metadata locked.",
    details: `IDENTITY: "${firstMetadata.title.toUpperCase()}"`,
    metadata_update: {
      title: firstMetadata.title,
      artist: firstMetadata.artist,
      cover: firstMetadata.imageUrl,
      thumbnail: firstMetadata.imageUrl,
      duration: firstMetadata.duration / 1000,
      previewUrl: firstMetadata.previewUrl,
    },
  });
  return { metadata: { ...firstMetadata }, soundchartsPromise };
}

async function fetchSpotifyPageData(videoURL) {
  const trackId = extractTrackId(videoURL);
  if (!trackId) return null;
  try {
    const { data } = await axios.get(
      `https://open.spotify.com/track/${trackId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      },
    );
    const $ = cheerio.load(data);
    return { cover: $('meta[property="og:image"]').attr("content") };
  } catch (e) {
    return null;
  }
}

async function resolveSideTasks(videoURL, metadata) {
  try {
    const res = await fetchSpotifyPageData(videoURL);
    if (res?.cover) metadata.imageUrl = res.cover;
  } catch (e) {}
}

async function fetchPreviewUrlManually(videoURL) {
  try {
    const trackId = extractTrackId(videoURL);
    if (!trackId) return null;
    const { data } = await axios.get(
      `https://open.spotify.com/embed/track/${trackId.replace(/[^a-zA-Z0-9]/g, "")}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      },
    );
    const $ = cheerio.load(data);
    const scriptContent = $('script[id="resource"]').html();
    if (scriptContent) {
      const json = JSON.parse(decodeURIComponent(scriptContent));
      if (json.preview_url) return json.preview_url;
    }
    const match = data.match(/"preview_url":"(https:[^"]+)"/);
    return match?.[1]?.replace(/\\/g, "/") || null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  fetchFromSoundcharts,
  fetchFromScrapers,
  fetchInitialMetadata,
  fetchSpotifyPageData,
  resolveSideTasks,
  fetchPreviewUrlManually,
};
