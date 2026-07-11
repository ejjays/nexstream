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
  // synthetic audio option: source url is a muxed video whose audio track is
  // demuxed out (-vn -c:a copy) rather than downloaded as-is.
  audioDemux?: boolean;
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
  // 30s clip url for on-device preview playback (spotify tracks)
  previewUrl?: string;
}

export interface ExtractorOptions {
  formatId?: string;
  cookie?: string;
}

// retryable=false for permanent fails (restricted/geo/private)
// expected=true: benign content-state fail, skip crash report
export class ExtractorError extends Error {
  readonly retryable: boolean;
  readonly expected: boolean;
  constructor(message: string, retryable = true, expected = false) {
    super(message);
    this.name = 'ExtractorError';
    this.retryable = retryable;
    this.expected = expected;
  }
}
