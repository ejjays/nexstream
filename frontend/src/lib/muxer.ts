import {
  Input,
  UrlSource,
  ALL_FORMATS,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  StreamTarget,
  type StreamTargetChunk,
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
  metadata?: { title?: string; artist?: string; album?: string };
}

// copy-mux needs no webcodecs or wasm
export function isClientMuxSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof ReadableStream !== 'undefined'
  );
}

// stream output to opfs, caps memory
async function openOpfsSink(): Promise<{
  target: StreamTarget;
  getFile: () => Promise<File>;
} | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return null;
  }
  try {
    const dir = await navigator.storage.getDirectory();
    const handle = await dir.getFileHandle('nexstream-edge-mux.mp4', {
      create: true,
    });
    const writable = await handle.createWritable();
    const stream = new WritableStream<StreamTargetChunk>({
      write: (chunk) => writable.write(chunk),
      close: () => writable.close(),
      abort: (reason) => writable.abort(reason),
    });
    return { target: new StreamTarget(stream), getFile: () => handle.getFile() };
  } catch {
    return null;
  }
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
  const { videoUrl, audioUrl, signal, onProgress, metadata } = options;

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

  const sink = await openOpfsSink();
  const target = sink ? sink.target : new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented' }),
    target,
  });
  const videoSource = new EncodedVideoPacketSource(videoCodec);
  const audioSource = new EncodedAudioPacketSource(audioCodec);
  output.addVideoTrack(videoSource);
  output.addAudioTrack(audioSource);

  // embed tags for parity with server path
  const tags: { title?: string; artist?: string; album?: string } = {};
  if (metadata?.title) tags.title = metadata.title;
  if (metadata?.artist) tags.artist = metadata.artist;
  if (metadata?.album) tags.album = metadata.album;
  if (Object.keys(tags).length > 0) output.setMetadataTags(tags);

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

  if (sink) return sink.getFile();
  const buffer = (target as BufferTarget).buffer;
  if (!buffer) throw new Error('Muxing produced no output');
  return new Blob([buffer], { type: 'video/mp4' });
}
