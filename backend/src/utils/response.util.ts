import { Response } from "express";
import { VideoInfo, SpotifyMetadata, Format, FinalResponse } from '../types/index.js';
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
): Promise<FinalResponse> {
  const finalTitle = normalizeTitle(info);
  const finalArtist = normalizeArtist(info);
  
  // image recovery
  const spotifyImg = spotifyData?.cover || spotifyData?.thumbnail || info?.thumbnail || info?.cover;
  let finalThumbnail = getBestThumbnail(info);
  
  if (isSpotify && spotifyImg) {
    finalThumbnail = await proxyThumbnailIfNeeded(spotifyImg, videoURL);
  } else {
    finalThumbnail = await proxyThumbnailIfNeeded(finalThumbnail, videoURL);
  }

  const formats: Format[] = processVideoFormats(info);
  const audioFormats: Format[] = processAudioFormats(info);

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
    id: info.id || spotifyData?.id || videoURL,
    title: isSpotify ? (spotifyData?.title || info.title) : finalTitle,
    artist: (isSpotify ? (spotifyData?.artist || info.artist) : finalArtist) || "Unknown",
    uploader: isSpotify ? (spotifyData?.artist || info.artist || info.uploader) : (finalArtist || info.uploader),
    album: isSpotify ? (spotifyData?.album || info.album || "") : (info.album || ""),
    cover: finalThumbnail || "/logo.webp",
    thumbnail: finalThumbnail || "/logo.webp",
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
  const asciiName = filename.replaceAll(/[^\x20-\x7E]/gu, '');
  
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
