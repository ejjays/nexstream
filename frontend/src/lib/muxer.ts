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
import { shouldVetoCopyMux, UnsupportedMuxCodecError } from './mux-codecs';

export type MuxProgress = (
  progress: number,
  detail?: string,
  bytes?: { received: number; total: number }
) => void;

export interface MuxOptions {
  videoUrl: string;
  audioUrl: string;
  signal?: AbortSignal;
  onProgress?: MuxProgress;
  metadata?: { title?: string; artist?: string; album?: string };
  durationHint?: number;
  videoBytesHint?: number;
}

// copy-mux needs no webcodecs or wasm
export function isClientMuxSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof ReadableStream !== 'undefined'
  );
}

const muxFileName = (session: string, suffix: string) =>
  `nexstream-mux-${session}-${suffix}`;

const STALE_MUX_FILE_MS = 5 * 60 * 1000;

/**
 * cleanup stale OPFS files from previous runs.
 * files stay alive for browser downloads, so we sweep
 * on next run instead of finally blocks.
 * skips new files to avoid cross-tab deletion.
 */
async function sweepStaleMuxFiles(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return;
  }
  try {
    const dir = await navigator.storage.getDirectory();
    const iterable = dir as unknown as {
      keys?: () => AsyncIterableIterator<string>;
    };
    if (typeof iterable.keys !== 'function') return;
    const now = Date.now();
    for await (const name of iterable.keys()) {
      const match = /^nexstream-mux-(\d+)-/.exec(name);
      if (!match) continue;
      const stamp = Number(match[1]);
      if (Number.isFinite(stamp) && now - stamp < STALE_MUX_FILE_MS) continue;
      await dir.removeEntry(name).catch(() => {});
    }
  } catch {
    // best-effort; ignore sweep failures
  }
}

// stream output to opfs, caps memory
async function openOpfsSink(name: string): Promise<{
  target: StreamTarget;
  getFile: () => Promise<File>;
} | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return null;
  }
  try {
    const dir = await navigator.storage.getDirectory();
    const handle = await dir.getFileHandle(name, {
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
  onBytes?: (received: number, total: number) => void,
  totalHint = 0
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
    // fallback if Content-Length header missing
    const headerTotal = Number(response.headers.get('content-length')) || 0;
    const total = headerTotal > 0 ? headerTotal : Math.max(0, totalHint);
    let received = 0;
    let lastDownPct = -1;
    let lastEmit = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        const pct = total > 0 ? Math.floor((received / total) * 100) : 0;
        const now = Date.now();
        if (pct !== lastDownPct || now - lastEmit >= 200) {
          lastDownPct = pct;
          lastEmit = now;
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
  let lastYield = Date.now();
  while (packet) {
    if (signal?.aborted) throw new Error('Edge muxing aborted');
    const shifted =
      offset > 0 ? packet.clone({ timestamp: packet.timestamp + offset }) : packet;
    await onPacket(shifted, first);
    first = false;
    packet = await sink.getNextPacket(packet);
    // avoid event loop block
    if (Date.now() - lastYield > 50) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastYield = Date.now();
    }
  }
}

export async function muxToMp4(options: MuxOptions): Promise<Blob> {
  const {
    videoUrl,
    audioUrl,
    signal,
    onProgress,
    metadata,
    durationHint,
    videoBytesHint,
  } = options;

  void sweepStaleMuxFiles();

  const session = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const [videoIn, audioIn] = await Promise.all([
    openBufferedInput(
      videoUrl,
      muxFileName(session, 'v.bin'),
      signal,
      (received, total) => {
        if (onProgress && total > 0) {
          onProgress(
            Math.min(90, Math.round((received / total) * 90)),
            'Downloading video...',
            { received, total }
          );
        }
      },
      videoBytesHint
    ),
    openBufferedInput(audioUrl, muxFileName(session, 'a.bin'), signal),
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
    // ensure mp4 compatibility before muxing
    const verdict = shouldVetoCopyMux(videoCodec, audioCodec);
    if (verdict.veto) {
      throw new UnsupportedMuxCodecError(
        `Source codecs not copy-safe for mp4 (${verdict.reason})`
      );
    }

    const videoConfig = await videoTrack.getDecoderConfig();
    const audioConfig = await audioTrack.getDecoderConfig();
    if (!videoConfig || !audioConfig) {
      throw new Error('Missing decoder config');
    }

    const sink = await openOpfsSink(muxFileName(session, 'out.mp4'));
    const target = sink ? sink.target : new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'fragmented' }),
      target,
    });
    const videoSource = new EncodedVideoPacketSource(videoCodec);
    const audioSource = new EncodedAudioPacketSource(audioCodec);
    output.addVideoTrack(videoSource);
    output.addAudioTrack(audioSource);

    const tags: { title?: string; artist?: string; album?: string } = {};
    if (metadata?.title) tags.title = metadata.title;
    if (metadata?.artist) tags.artist = metadata.artist;
    if (metadata?.album) tags.album = metadata.album;
    if (Object.keys(tags).length > 0) output.setMetadataTags(tags);

    await output.start();

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
