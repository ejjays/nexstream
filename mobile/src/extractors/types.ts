export interface Format {
  formatId: string;
  url: string;
  extension: string;
  resolution?: string;
  quality?: string;
  width?: number;
  height?: number;
  tbr?: number;
  acodec?: string;
  vcodec?: string;
  isAudio: boolean;
  isVideo: boolean;
  isMuxed: boolean;
  filesize?: number;
  muxAudioUrl?: string;
  muxAudioExt?: string;
  isHls?: boolean;
  hlsAudioUrl?: string;
  hlsKeepAlive?: boolean;
  noTranscode?: boolean;
}

export interface VideoInfo {
  type: 'video';
  id: string;
  title: string;
  uploader: string;
  album?: string;
  webpageUrl: string;
  thumbnail?: string;
  duration?: number;
  formats: Format[];
  extractorKey: string;
  isJsInfo: boolean;
  fromBrain: boolean;
  isPartial: boolean;
  isIsrcMatch: boolean;
  isFullData: boolean;
  metascraper?: { title?: string };
  downloadHeaders?: Record<string, string>;
}

export interface ExtractorOptions {
  formatId?: string;
  cookie?: string;
}
