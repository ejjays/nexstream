const MP4_UNSAFE_VIDEO_CODECS = new Set(['vp8']);
const MP4_UNSAFE_AUDIO_CODECS = new Set(['vorbis']);

export function isMp4CopySafeVideoCodec(codec?: string | null): boolean {
  if (!codec) return false;
  return !MP4_UNSAFE_VIDEO_CODECS.has(codec);
}

export function isMp4CopySafeAudioCodec(codec?: string | null): boolean {
  if (!codec) return false;
  return !MP4_UNSAFE_AUDIO_CODECS.has(codec);
}

export interface CopyMuxVeto {
  veto: boolean;
  reason?: string;
}

// only vetoes known copy-unsafe codecs (e.g. vp8/vorbis in mp4); anything else passes through
export function shouldVetoCopyMux(
  videoCodec: string | null | undefined,
  audioCodec: string | null | undefined
): CopyMuxVeto {
  if (videoCodec && !isMp4CopySafeVideoCodec(videoCodec)) {
    return { veto: true, reason: `video_codec_${videoCodec}` };
  }
  if (audioCodec && !isMp4CopySafeAudioCodec(audioCodec)) {
    return { veto: true, reason: `audio_codec_${audioCodec}` };
  }
  return { veto: false };
}

export class UnsupportedMuxCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedMuxCodecError';
  }
}
