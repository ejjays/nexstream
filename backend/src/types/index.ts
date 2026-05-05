import { Readable } from 'node:stream';

export interface Format {
  format_id: string;
  url: string;
  ext: string;
  extension?: string;
  resolution?: string;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  is_muxed?: boolean;
  is_video?: boolean;
  is_audio?: boolean;
  audio_url?: string;
  fps?: string | number;
  quality?: string;
  note?: string;
  abr?: number;
  tbr?: number;
  itag?: number;
  width?: number;
  height?: number;
}

export interface SpotifyMetadata {
  id: string;
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  thumbnail?: string;
  previewUrl?: string;
  isrc?: string;
  targetUrl?: string;
  target_url?: string;
  fromBrain?: boolean;
  formats?: Format[];
  audioFormats?: Format[];
  audioFeatures?: any; 
  year?: string;
  isIsrcMatch?: boolean;
  is_js_info?: boolean;
  imageUrl?: string;
  duration?: number;
  source?: string;
}

export interface VideoInfo {
  id: string;
  title: string;
  uploader: string;
  author?: string;
  description?: string;
  thumbnail: string;
  cover?: string;
  webpage_url: string;
  duration?: number;
  formats: Format[];
  audioFormats?: Format[];
  extractor_key?: string;
  is_js_info?: boolean;
  isIsrcMatch?: boolean;
  fromBrain?: boolean;
  target_url?: string;
  targetUrl?: string;
  isrc?: string;
  previewUrl?: string;
  artist?: string;
  album?: string;
  view_count?: number;
  original_info?: any;
  is_spotify?: boolean;
  is_partial?: boolean;
  isPartial?: boolean;
  isFullData?: boolean;
}

export interface SSEEvent {
  status: 'initializing' | 'seeding' | 'extracting' | 'processing' | 'success' | 'error' | 'downloading' | 'finished';
  progress?: number;
  subStatus?: string;
  details?: string;
  text?: string;
  message?: string;
}

export interface ExtractorOptions {
  cookie?: string;
  cookie_name?: string;
  formatId?: string;
  onProgress?: (status: string, progress: number, subStatus?: string, details?: string) => void;
  signal?: AbortSignal;
}

export interface Extractor {
  getInfo: (url: string, options?: ExtractorOptions) => Promise<VideoInfo | null>;
  getStream: (videoInfo: VideoInfo, options?: ExtractorOptions) => Promise<Readable>;
}

export interface ChordsResult {
  key: string;
  scale: string;
  chords: string[];
}

export interface TursoResult<T = any> {
    rows: T[];
}

export interface TursoStatement {
    sql: string;
    args?: (string | number | null)[];
}
