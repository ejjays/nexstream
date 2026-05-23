import { z } from 'zod';

export const FormatSchema = z.object({
  format_id: z.string(),
  url: z.string().url(),
  ext: z.string(),
  extension: z.string().optional(),
  resolution: z.string().optional(),
  vcodec: z.string().optional(),
  acodec: z.string().optional(),
  filesize: z.number().optional(),
  is_muxed: z.boolean().optional(),
  is_video: z.boolean().optional(),
  is_audio: z.boolean().optional(),
  audio_url: z.string().optional(),
  fps: z.union([z.string(), z.number()]).optional(),
  quality: z.string().optional(),
  note: z.string().optional(),
  abr: z.number().optional(),
  tbr: z.number().optional(),
  itag: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const AudioFeaturesSchema = z.object({
  danceability: z.number(),
  energy: z.number(),
  key: z.number(),
  loudness: z.number(),
  mode: z.number(),
  speechiness: z.number(),
  acousticness: z.number(),
  instrumentalness: z.number(),
  liveness: z.number(),
  valence: z.number(),
  tempo: z.number(),
  duration_ms: z.number(),
  time_signature: z.number(),
});

export const BaseMediaDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  cover: z.string().optional(),
  thumbnail: z.string().optional(),
  imageUrl: z.string().optional(),
  previewUrl: z.string().nullable().optional(),
  isrc: z.string().optional(),
  targetUrl: z.string().optional(),
  target_url: z.string().optional(),
  fromBrain: z.boolean().optional(),
  audioFormats: z.array(FormatSchema).optional(),
  duration: z.number().optional(),
  isIsrcMatch: z.boolean().optional(),
  is_js_info: z.boolean().optional(),
  is_spotify: z.boolean().optional(),
  isPartial: z.boolean().optional(),
  is_partial: z.boolean().optional(),
});

export const SpotifyMetadataSchema = BaseMediaDataSchema.extend({
  artist: z.string(),
  album: z.string().optional(),
  audioFeatures: AudioFeaturesSchema.optional(),
  year: z.string().optional(),
  source: z.string().optional(),
  formats: z.array(FormatSchema).optional(),
});

export const VideoInfoSchema = BaseMediaDataSchema.extend({
  uploader: z.string(),
  webpage_url: z.string().url(),
  formats: z.array(FormatSchema),
  author: z.string().optional(),
  description: z.string().optional(),
  extractor_key: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  view_count: z.number().optional(),
  original_info: z.unknown().optional(),
  isFullData: z.boolean().optional(),
  metascraper: z.record(z.unknown()).optional(),
}).catchall(z.unknown());

export const FinalResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  uploader: z.string(),
  album: z.string(),
  cover: z.string(),
  thumbnail: z.string(),
  duration: z.number().optional(),
  previewUrl: z.string().nullable().optional(),
  formats: z.array(FormatSchema),
  audioFormats: z.array(FormatSchema),
  spotifyMetadata: SpotifyMetadataSchema.optional(),
  isPartial: z.boolean(),
  isrc: z.string().optional(),
  isIsrcMatch: z.boolean(),
  webpage_url: z.string().url(),
});

export type Format = z.infer<typeof FormatSchema>;
export type VideoInfo = z.infer<typeof VideoInfoSchema>;
export type SpotifyMetadata = z.infer<typeof SpotifyMetadataSchema>;
export type FinalResponse = z.infer<typeof FinalResponseSchema>;
export type AudioFeatures = z.infer<typeof AudioFeaturesSchema>;
