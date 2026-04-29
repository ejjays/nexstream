export interface Format {
  format_id: string;
  url: string;
  ext: string;
  resolution?: string;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  is_muxed?: boolean;
  is_video?: boolean;
  is_audio?: boolean;
  fps?: string | number;
  quality?: string;
  note?: string;
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
  fromBrain?: boolean;
}

export interface VideoInfo {
  id: string;
  title: string;
  uploader: string;
  author?: string;
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
  isrc?: string;
  previewUrl?: string;
  artist?: string;
  album?: string;
}

export interface SSEEvent {
  status: 'initializing' | 'seeding' | 'extracting' | 'processing' | 'success' | 'error' | 'downloading' | 'finished';
  progress?: number;
  subStatus?: string;
  details?: string;
  text?: string;
  message?: string;
}
