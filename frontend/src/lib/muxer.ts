import {
  Input,
  UrlSource,
  BlobSource,
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
  durationHint?: number;
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

// fetch once to opfs, mux from disk
async function openBufferedInput(
  url: string,
  name: string,
  signal?: AbortSignal,
  onBytes?: (received: number, total: number) => void
): Promise<{ source: UrlSource | BlobSource; cleanup: () => Promise<void> }> {
  const tagged = `${url}${url.includes('?') ? '&' : '?'}via=eme`;
  const noCleanup = async () => {};
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return { source: new UrlSource(tagged), cleanup: noCleanup };
  }
  try {
    const dir = await navigator.storage.getDirectory();
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    const response = await fetch(tagged, { signal });
    if (!response.ok || !response.body) {
      await writable.abort().catch(() => {});
      throw new Error(`buffered fetch failed: ${response.status}`);
    }
    const total = Number(response.headers.get('content-length')) || 0;
    let received = 0;
    let lastDownPct = -1;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        const pct = total > 0 ? Math.floor((received / total) * 100) : 0;
        if (pct !== lastDownPct) {
          lastDownPct = pct;
          onBytes?.(received, total);
        }
        controller.enqueue(chunk);
      },
    });
    await response.body.pipeThrough(counter).pipeTo(writable);
    const file = await handle.getFile();
    return {
      source: new BlobSource(file),
      cleanup: async () => {
        try {
          await dir.removeEntry(name);
        } catch {
          // ignore cleanup failure
        }
      },
    };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    return { source: new UrlSource(tagged), cleanup: noCleanup };
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
  let count = 0;
  while (packet) {
    if (signal?.aborted) throw new Error('Edge muxing aborted');
    const shifted =
      offset > 0 ? packet.clone({ timestamp: packet.timestamp + offset }) : packet;
    await onPacket(shifted, first);
    first = false;
    packet = await sink.getNextPacket(packet);
    // yield so the ui can paint
    if (++count % 32 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

// merge separate video and audio streams
export async function muxToMp4(options: MuxOptions): Promise<Blob> {
  const { videoUrl, audioUrl, signal, onProgress, metadata, durationHint } =
    options;

  // buffer inputs; each stream fetched once
  const [videoIn, audioIn] = await Promise.all([
    openBufferedInput(
      videoUrl,
      'nexstream-in-v.bin',
      signal,
      (received, total) => {
        if (onProgress && total > 0) {
          onProgress(
            Math.min(90, Math.round((received / total) * 90)),
            'Downloading video...'
          );
        }
      }
    ),
    openBufferedInput(audioUrl, 'nexstream-in-a.bin', signal),
  ]);

  const videoInput = new Input({
    source: videoIn.source,
    formats: ALL_FORMATS,
  });
  const audioInput = new Input({
    source: audioIn.source,
    formats: ALL_FORMATS,
  });

  try {
    const videoTrack = await videoInput.getPrimaryVideoTrack();
    const audioTrack = await audioInput.getPrimaryAudioTrack();
    if (!videoTrack) throw new Error('No video track in source');
    if (!audioTrack) throw new Error('No audio track in source');

    const videoCodec = await videoTrack.getCodec();
    const audioCodec = await audioTrack.getCodec();
    if (!videoCodec || !audioCodec) {
      throw new Error('Unsupported source codec');
    }

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

    // skip full-file scan when duration is known
    const duration =
      durationHint && durationHint > 0
        ? durationHint
        : await videoInput.computeDuration().catch(() => 0);

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

    let lastMuxPct = -1;
    await Promise.all([
      pumpTrack(
        videoSink,
        videoFirst,
        offset,
        async (packet, first) => {
          await videoSource.add(packet, first ? videoMeta : undefined);
          if (onProgress && duration > 0) {
            const ratio = Math.min(1, packet.timestamp / duration);
            const pct = 90 + Math.round(ratio * 10);
            if (pct !== lastMuxPct) {
              lastMuxPct = pct;
              onProgress(pct, `Muxing ${pct}%`);
            }
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
  } finally {
    // always release the buffered opfs inputs
    await videoIn.cleanup();
    await audioIn.cleanup();
  }
}
