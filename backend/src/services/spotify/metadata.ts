import _spotifyUrlInfo from "spotify-url-info";
const spotifyUrlInfo = (_spotifyUrlInfo as any).default || _spotifyUrlInfo;
const { getData, getDetails } = spotifyUrlInfo(fetch);
import { load } from "cheerio";
import { extractTrackId } from "../../utils/validation.util.js";
import { getSpotifyAccessToken } from "../../utils/spotify.util.js";
import { fetchFromOdesli } from "./external.js";

const SOUNDCHARTS_APP_ID = process.env.SOUNDCHARTS_APP_ID;
const SOUNDCHARTS_API_KEY = process.env.SOUNDCHARTS_API_KEY;

async function fetchFromSpotifyAPI(spotifyUrl: string): Promise<any> {
  try {
    const trackId = extractTrackId(spotifyUrl);
    if (!trackId) return null;

    const token = await getSpotifyAccessToken();
    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) return null;
    const track: any = await response.json();

    let audioFeatures = null;
    try {
      const afRes = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (afRes.ok) audioFeatures = await afRes.json();
    } catch (e) {}

    return {
      title: track.name,
      artist: track.artists?.[0]?.name || "Unknown Artist",
      album: track.album?.name || "",
      imageUrl: track.album?.images?.[0]?.url || "",
      duration: track.duration_ms || 0,
      isrc: track.external_ids?.isrc || "",
      audioFeatures: audioFeatures,
      year: track.album?.release_date ? track.album.release_date.split("-")[0] : "Unknown",
      previewUrl: track.preview_url || null,
      source: "spotify_api",
    };
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[Spotify-API] Error: ${error.message}`);
    return null;
  }
}

export async function fetchFromSoundcharts(spotifyUrl: string): Promise<any> {
  try {
    const trackId = extractTrackId(spotifyUrl);
    if (!trackId) return null;

    const safeId = trackId.replace(/[^a-zA-Z0-9]/g, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `https://customer.api.soundcharts.com/api/v2.25/song/by-platform/spotify/${safeId}`,
      {
        headers: {
          "x-app-id": SOUNDCHARTS_APP_ID as string,
          "x-api-key": SOUNDCHARTS_API_KEY as string,
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data: any = await response.json();
    if (!data?.object) return null;

    const obj = data.object;
    return {
      title: obj.name,
      artist: obj.artists?.[0]?.name || "Unknown Artist",
      album: obj.labels?.[0]?.name || "",
      imageUrl: obj.imageUrl,
      duration: (obj.duration || 0) * 1000,
      isrc: obj.isrc?.value || "",
      audioFeatures: obj.audio || null,
      year: obj.releaseDate ? obj.releaseDate.split("-")[0] : "Unknown",
      previewUrl: obj.previewUrl || obj.audioPreviewUrl || obj.spotify?.previewUrl || obj.preview_url || null,
      source: "soundcharts",
    };
  } catch (err) {
    return null;
  }
}

export async function fetchFromScrapers(videoURL: string): Promise<any> {
  const trackId = extractTrackId(videoURL);
  if (!trackId) return null;
  const safeUrl = `https://open.spotify.com/track/${trackId}`;

  try {
    let details: any = null;
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
        const oembedData: any = await oembedRes.json();
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
      title: details.name || details.preview?.title || details.title || "Unknown Title",
      artist: (details.artists && details.artists[0]?.name) || details.preview?.artist || details.artist || "Unknown Artist",
      album: (details.album && details.album.name) || details.preview?.album || details.album || "",
      imageUrl: (details.visualIdentity?.image && details.visualIdentity.image[details.visualIdentity.image.length - 1]?.url) || (details.coverArt?.sources && details.coverArt.sources[details.coverArt.sources.length - 1]?.url) || details.preview?.image || details.image || details.thumbnail_url || "",
      duration: details.duration_ms || details.duration || details.preview?.duration_ms || 0,
      year: (typeof details.releaseDate === "string" && details.releaseDate.split("-")[0]) || (typeof details.release_date === "string" && details.release_date.split("-")[0]) || "Unknown",
      isrc: details.external_ids?.isrc || details.isrc || details.preview?.isrc || "",
      previewUrl: details.preview_url || details.audio_preview_url || details.preview?.audio_url || (details.tracks && details.tracks[0]?.preview_url) || null,
      source: "scrapers",
    };
  } catch (err) {
    return null;
  }
}

export async function fetchInitialMetadata(videoURL: string, onProgress: any, startTime: number): Promise<any> {
  onProgress("fetching_info", 10, "Consulting Spotify API...");

  const officialMetadata = await fetchFromSpotifyAPI(videoURL).catch(() => null);
  
  if (officialMetadata) {
    return finalizeMetadata(officialMetadata, onProgress);
  }

  onProgress("fetching_info", 12, "Falling back to multi-source race...");

  const soundchartsPromise = fetchFromSoundcharts(videoURL).catch(() => null);
  const scrapersPromise = fetchFromScrapers(videoURL).catch(() => null);
  const odesliPromise = fetchFromOdesli(videoURL).catch(() => null);

  const firstMetadata = await Promise.any([
    soundchartsPromise.then((res) => res || Promise.reject(new Error("No Soundcharts"))),
    scrapersPromise.then((res) => res || Promise.reject(new Error("No Scrapers"))),
    odesliPromise.then((res) => res || Promise.reject(new Error("No Odesli"))),
  ]).catch(() => null);

  if (!firstMetadata) {
    throw new Error("Metadata fetch failed: All providers returned null");
  }

  return finalizeMetadata(firstMetadata, onProgress, soundchartsPromise);
}

function finalizeMetadata(metadata: any, onProgress: any, soundchartsPromise: any = null) {
  metadata.cover = metadata.imageUrl;
  metadata.thumbnail = metadata.imageUrl;

  onProgress("fetching_info", 20, "Metadata locked.", JSON.stringify({
    metadata_update: {
      title: metadata.title,
      artist: metadata.artist,
      cover: metadata.imageUrl,
      thumbnail: metadata.imageUrl,
      duration: metadata.duration / 1000,
      previewUrl: metadata.previewUrl,
      isrc: metadata.isrc,
      audioFeatures: metadata.audioFeatures,
      isPartial: true
    },
  }));
  return { metadata, soundchartsPromise: soundchartsPromise || Promise.resolve(metadata) };
}

export async function fetchSpotifyPageData(videoURL: string): Promise<any> {
  const trackId = extractTrackId(videoURL);
  if (!trackId) return null;
  try {
    const response = await fetch(`https://open.spotify.com/track/${trackId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const data = await response.text();
    const $ = load(data);
    return { cover: $('meta[property="og:image"]').attr("content") };
  } catch (e) {
    return null;
  }
}

export async function resolveSideTasks(videoURL: string, metadata: any): Promise<void> {
  try {
    const res = await fetchSpotifyPageData(videoURL);
    if (res?.cover) metadata.imageUrl = res.cover;
  } catch (e) {}
}

export async function fetchPreviewUrlManually(videoURL: string): Promise<string | null> {
  try {
    const trackId = extractTrackId(videoURL);
    if (!trackId) return null;
    const response = await fetch(`https://open.spotify.com/embed/track/${trackId.replace(/[^a-zA-Z0-9]/g, "")}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const data = await response.text();
    const $ = load(data);
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
