import {
  Input,
  UrlSource,
  ALL_FORMATS,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  type EncodedPacket,
} from 'mediabunny';

export type MuxProgress = (progress: number, detail?: string) => void;

export interface MuxOptions {
  videoUrl: string;
  audioUrl: string;
  signal?: AbortSignal;
  onProgress?: MuxProgress;
}

// copy-mux needs no webcodecs or wasm
export function isClientMuxSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof ReadableStream !== 'undefined'
  );
}

// walk packets, applying a timestamp offset
async function pumpTrack(
  sink: EncodedPacketSink,
  firstPacket: EncodedPacket | null,
  offset: number,
  onPacket: (packet: EncodedPacket, first: boolean) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  let packet = firstPacket;
  let first = true;
  while (packet) {
    if (signal?.aborted) throw new Error('Edge muxing aborted');
    const shifted =
      offset > 0 ? packet.clone({ timestamp: packet.timestamp + offset }) : packet;
    await onPacket(shifted, first);
    first = false;
    packet = await sink.getNextPacket(packet);
  }
}

// merge separate video and audio streams
export async function muxToMp4(options: MuxOptions): Promise<Blob> {
  const { videoUrl, audioUrl, signal, onProgress } = options;

  const videoInput = new Input({
    source: new UrlSource(videoUrl),
    formats: ALL_FORMATS,
  });
  const audioInput = new Input({
    source: new UrlSource(audioUrl),
    formats: ALL_FORMATS,
  });

  const videoTrack = await videoInput.getPrimaryVideoTrack();
  const audioTrack = await audioInput.getPrimaryAudioTrack();
  if (!videoTrack) throw new Error('No video track in source');
  if (!audioTrack) throw new Error('No audio track in source');

  const videoCodec = await videoTrack.getCodec();
  const audioCodec = await audioTrack.getCodec();
  if (!videoCodec || !audioCodec) throw new Error('Unsupported source codec');

  const videoConfig = await videoTrack.getDecoderConfig();
  const audioConfig = await audioTrack.getDecoderConfig();
  // decoder config seeds the mp4 sample description
  if (!videoConfig || !audioConfig) {
    throw new Error('Missing decoder config');
  }

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented' }),
    target,
  });
  const videoSource = new EncodedVideoPacketSource(videoCodec);
  const audioSource = new EncodedAudioPacketSource(audioCodec);
  output.addVideoTrack(videoSource);
  output.addAudioTrack(audioSource);
  await output.start();

  const duration = await videoInput.computeDuration().catch(() => 0);

  // config goes on first packet only
  const videoMeta = { decoderConfig: videoConfig } as Parameters<
    EncodedVideoPacketSource['add']
  >[1];
  const audioMeta = { decoderConfig: audioConfig } as Parameters<
    EncodedAudioPacketSource['add']
  >[1];

  const videoSink = new EncodedPacketSink(videoTrack);
  const audioSink = new EncodedPacketSink(audioTrack);
  const videoFirst = await videoSink.getFirstPacket();
  const audioFirst = await audioSink.getFirstPacket();
  // shift past negative start timestamps
  const minTs = Math.min(
    videoFirst?.timestamp ?? 0,
    audioFirst?.timestamp ?? 0,
    0
  );
  const offset = minTs < 0 ? -minTs : 0;

  await Promise.all([
    pumpTrack(
      videoSink,
      videoFirst,
      offset,
      async (packet, first) => {
        await videoSource.add(packet, first ? videoMeta : undefined);
        if (onProgress && duration > 0) {
          const pct = Math.min(99, Math.round((packet.timestamp / duration) * 100));
          onProgress(pct, `Muxing ${pct}%`);
        }
      },
      signal
    ),
    pumpTrack(
      audioSink,
      audioFirst,
      offset,
      async (packet, first) => {
        await audioSource.add(packet, first ? audioMeta : undefined);
      },
      signal
    ),
  ]);

  await output.finalize();

  const buffer = target.buffer;
  if (!buffer) throw new Error('Muxing produced no output');
  return new Blob([buffer], { type: 'video/mp4' });
}
