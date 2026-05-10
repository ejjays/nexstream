import { Response } from "express";
import { VideoInfo, SpotifyMetadata, Format } from '../types/index.js';
import { processVideoFormats, processAudioFormats } from "./format.util.js";
import {
  normalizeTitle,
  normalizeArtist,
  getBestThumbnail,
  proxyThumbnailIfNeeded,
} from "../services/social.service.js";

export async function prepareFinalResponse(
  info: VideoInfo, 
  isSpotify: boolean, 
  spotifyData: SpotifyMetadata | null, 
  videoURL: string
) {
  const finalTitle = normalizeTitle(info as any);
  const finalArtist = normalizeArtist(info as any);
  
  // Robust image recovery
  let spotifyImg = spotifyData?.cover || spotifyData?.thumbnail || info?.thumbnail || info?.cover || info?.thumbnail;
  let finalThumbnail = getBestThumbnail(info as any);
  
  if (isSpotify && spotifyImg) {
    finalThumbnail = await proxyThumbnailIfNeeded(spotifyImg, videoURL);
  } else {
    finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);
  }

  // Preserve processed formats if already present (e.g. from cache)
  const formats: Format[] = (info.formats && info.formats.length > 0 && info.formats[0].quality) 
    ? info.formats 
    : processVideoFormats(info);
    
  const audioFormats: Format[] = (info.audioFormats && info.audioFormats.length > 0) 
    ? info.audioFormats 
    : processAudioFormats(info);

  type InfoExtended = {
    spotifyMetadata?: SpotifyMetadata;
    isPartial?: boolean;
    is_partial?: boolean;
  };
  const infoExt = info as InfoExtended;

  if (isSpotify && (spotifyData?.previewUrl || info.previewUrl)) {
    console.log(`[Response] Sending Preview: ${(spotifyData?.previewUrl || info.previewUrl || '').substring(0, 50)}...`);
  } else if (isSpotify) {
    console.log(`[Response] No Preview found for ${finalTitle}`);
  }

  return {
    title: isSpotify ? (spotifyData?.title || info.title) : finalTitle,
    artist: isSpotify ? (spotifyData?.artist || info.artist) : finalArtist,
    album: isSpotify ? (spotifyData?.album || info.album || "") : (info.album || ""),
    cover: finalThumbnail,
    thumbnail: finalThumbnail,
    duration: info.duration,
    previewUrl: isSpotify ? (spotifyData?.previewUrl || info.previewUrl) : null,
    formats: formats,
    audioFormats: audioFormats,
    spotifyMetadata: spotifyData || infoExt.spotifyMetadata,
    isPartial: infoExt.isPartial || infoExt.is_partial || false,
    isrc: spotifyData?.isrc || info.isrc,
    isIsrcMatch: info.isIsrcMatch || false,
    webpage_url: videoURL
  };
}

export function prepareBrainResponse(spotifyData: SpotifyMetadata) {
  type SpotifyDataExtended = {
    duration?: number;
    formats?: Format[];
    audioFormats?: Format[];
  };
  const spDataExt = spotifyData as SpotifyDataExtended;

  return {
    title: spotifyData.title,
    artist: spotifyData.artist,
    album: spotifyData.album,
    cover: spotifyData.cover || "/logo.webp",
    thumbnail: spotifyData.thumbnail || "/logo.webp",
    duration: spDataExt.duration ? spDataExt.duration / 1000 : 0,
    previewUrl: spotifyData.previewUrl,
    formats: spDataExt.formats ?? [],
    audioFormats: spDataExt.audioFormats ?? [],
    spotifyMetadata: spotifyData,
  };
}

export function setupConvertResponse(res: Response, filename: string, format: string, _size = 0) {
  const mimeTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    mp4: "video/mp4",
    opus: "audio/opus",
    ogg: "audio/ogg",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png"
  };

  const safeName = encodeURIComponent(filename);
  const asciiName = filename.replaceAll(/[^\x20-\x7E]/g, '');
  
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiName.replaceAll('"', '')}"; filename*=UTF-8''${safeName}`,
  );
  res.setHeader(
    "Content-Type",
    mimeTypes[format] || "application/octet-stream",
  );

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
}
