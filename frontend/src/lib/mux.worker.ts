/**
 * Edge-mux Web Worker.
 *
 * runs whole download + copy-mux off the main thread & writes straight
 * to OPFS via createSyncAccessHandle — which only exists inside a worker.
 * it bypasses the main threads RAM ceiling (the cause of large 4K dowloads
 * aborting ~520MB): bytes go disk → disk instead of buffering  in tab memory.
 *
 * Protocol (postMessage):
 *   in : { type: 'start', videoUrl, audioUrl, metadata?, durationHint?, videoBytesHint? }
 *        { type: 'cancel' }
 *   out: { type: 'progress', pct, detail?, bytes? }
 *        { type: 'done', file }
 *        { type: 'error', name?, message? }
 */
import {
  Input,
  BlobSource,
  ALL_FORMATS,
  Output,
  Mp4OutputFormat,
  StreamTarget,
  type StreamTargetChunk,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  type EncodedPacket,
} from 'mediabunny';
import { shouldVetoCopyMux, UnsupportedMuxCodecError } from './mux-codecs';
import { resumableFetchToSink } from './resumableFetch';

interface NexSyncAccessHandle {
  write(buffer: Uint8Array, options?: { at?: number }): number;
  flush(): void | Promise<void>;
  close(): void | Promise<void>;
}
interface NexSyncFileHandle extends FileSystemFileHandle {
  createSyncAccessHandle(): Promise<NexSyncAccessHandle>;
}

interface MuxStartMessage {
  type: 'start';
  videoUrl: string;
  audioUrl: string;
  metadata?: { title?: string; artist?: string; album?: string };
  durationHint?: number;
  videoBytesHint?: number;
}

const ctx = self as unknown as {
  postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent) => void) | null;
};

const muxName = (session: string, suffix: string) =>
  `nexstream-mux-${session}-${suffix}`;

const FLUSH_INTERVAL = 32 * 1024 * 1024;

const RESUME_MAX_ATTEMPTS = 5;

const post = (
  pct: number,
  detail?: string,
  bytes?: { received: number; total: number }
) => ctx.postMessage({ type: 'progress', pct, detail, bytes });

// fetch a stream straight to disk
async function fetchToDisk(
  dir: FileSystemDirectoryHandle,
  url: string,
  name: string,
  signal: AbortSignal,
  onBytes?: (received: number, total: number) => void
): Promise<File> {
  const tagged = `${url}${url.includes('?') ? '&' : '?'}via=eme`;
  const handle = (await dir.getFileHandle(name, {
    create: true,
  })) as NexSyncFileHandle;
  const access = await handle.createSyncAccessHandle();
  let written = 0;
  let lastEmit = 0;
  try {
    const result = await resumableFetchToSink({
      url: tagged,
      signal,
      maxAttempts: RESUME_MAX_ATTEMPTS,
      flushEvery: FLUSH_INTERVAL,
      writeAt: (offset, chunk) => {
        access.write(chunk, { at: offset });
      },
      onFlush: async () => {
        await access.flush();
      },
      onProgress: (received, total) => {
        written = received;
        const now = Date.now();
        if (onBytes && now - lastEmit >= 200) {
          lastEmit = now;
          onBytes(received, total);
        }
      },
    });
    await access.flush();
    onBytes?.(result.received, result.total);
  } catch (err) {
    if ((err as { name?: string })?.name === 'QuotaExceededError') {
      (err as { ceiling?: number }).ceiling = written;
    }
    throw err;
  } finally {
    await access.close();
  }
  return handle.getFile();
}

async function pumpTrack(
  sink: EncodedPacketSink,
  firstPacket: EncodedPacket | null,
  offset: number,
  onPacket: (packet: EncodedPacket, first: boolean) => Promise<void>,
  signal: AbortSignal
): Promise<void> {
  let packet = firstPacket;
  let first = true;
  let lastYield = Date.now();
  while (packet) {
    if (signal.aborted) throw new Error('Edge muxing aborted');
    const shifted =
      offset > 0
        ? packet.clone({ timestamp: packet.timestamp + offset })
        : packet;
    await onPacket(shifted, first);
    first = false;
    packet = await sink.getNextPacket(packet);
    if (Date.now() - lastYield > 50) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastYield = Date.now();
    }
  }
}

// copy-mux buffered files, output to disk
async function muxToDisk(
  dir: FileSystemDirectoryHandle,
  videoFile: File,
  audioFile: File,
  outName: string,
  job: MuxStartMessage,
  signal: AbortSignal
): Promise<File> {
  const videoInput = new Input({
    source: new BlobSource(videoFile),
    formats: ALL_FORMATS,
  });
  const audioInput = new Input({
    source: new BlobSource(audioFile),
    formats: ALL_FORMATS,
  });

  const videoTrack = await videoInput.getPrimaryVideoTrack();
  const audioTrack = await audioInput.getPrimaryAudioTrack();
  if (!videoTrack) throw new Error('No video track in source');
  if (!audioTrack) throw new Error('No audio track in source');

  const videoCodec = await videoTrack.getCodec();
  const audioCodec = await audioTrack.getCodec();
  if (!videoCodec || !audioCodec) throw new Error('Unsupported source codec');
  const verdict = shouldVetoCopyMux(videoCodec, audioCodec);
  if (verdict.veto) {
    throw new UnsupportedMuxCodecError(
      `Source codecs not copy-safe for mp4 (${verdict.reason})`
    );
  }

  const videoConfig = await videoTrack.getDecoderConfig();
  const audioConfig = await audioTrack.getDecoderConfig();
  if (!videoConfig || !audioConfig) throw new Error('Missing decoder config');

  const outHandle = (await dir.getFileHandle(outName, {
    create: true,
  })) as NexSyncFileHandle;
  const outAccess = await outHandle.createSyncAccessHandle();
  try {
    const outStream = new WritableStream<StreamTargetChunk>({
      write: (chunk) => {
        outAccess.write(chunk.data, { at: chunk.position });
      },
    });
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'fragmented' }),
      target: new StreamTarget(outStream),
    });
    const videoSource = new EncodedVideoPacketSource(videoCodec);
    const audioSource = new EncodedAudioPacketSource(audioCodec);
    output.addVideoTrack(videoSource);
    output.addAudioTrack(audioSource);

    const tags: { title?: string; artist?: string; album?: string } = {};
    if (job.metadata?.title) tags.title = job.metadata.title;
    if (job.metadata?.artist) tags.artist = job.metadata.artist;
    if (job.metadata?.album) tags.album = job.metadata.album;
    if (Object.keys(tags).length > 0) output.setMetadataTags(tags);

    await output.start();

    const duration =
      job.durationHint && job.durationHint > 0
        ? job.durationHint
        : await videoInput.computeDuration().catch(() => 0);

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
    const tsOffset = minTs < 0 ? -minTs : 0;

    let lastMuxPct = -1;
    await Promise.all([
      pumpTrack(
        videoSink,
        videoFirst,
        tsOffset,
        async (packet, first) => {
          await videoSource.add(packet, first ? videoMeta : undefined);
          if (duration > 0) {
            const ratio = Math.min(1, packet.timestamp / duration);
            const pct = 90 + Math.round(ratio * 10);
            if (pct !== lastMuxPct) {
              lastMuxPct = pct;
              post(pct, `Muxing ${pct}%`);
            }
          }
        },
        signal
      ),
      pumpTrack(
        audioSink,
        audioFirst,
        tsOffset,
        async (packet, first) => {
          await audioSource.add(packet, first ? audioMeta : undefined);
        },
        signal
      ),
    ]);

    await output.finalize();
    await outAccess.flush();
  } finally {
    await outAccess.close();
  }
  return outHandle.getFile();
}

async function reportStorage(tag: string): Promise<void> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) {
      ctx.postMessage({
        type: 'diag',
        tag,
        usage: est.usage,
        quota: est.quota,
      });
    }
  } catch {
    // ignore estimate failure
  }
}

const ORPHAN_AGE_MS = 60 * 1000;

// delete leftover files from prior runs
async function sweepOrphans(dir: FileSystemDirectoryHandle): Promise<void> {
  const iterable = dir as unknown as {
    keys?: () => AsyncIterableIterator<string>;
  };
  if (typeof iterable.keys !== 'function') return;
  const now = Date.now();
  try {
    for await (const name of iterable.keys()) {
      const match = /^nexstream-mux-(\d+)-/.exec(name);
      if (!match) continue;
      const stamp = Number(match[1]);
      if (Number.isFinite(stamp) && now - stamp < ORPHAN_AGE_MS) continue;
      await dir.removeEntry(name).catch(() => {});
    }
  } catch {
    // ignore sweep failure
  }
}

async function runJob(
  job: MuxStartMessage,
  signal: AbortSignal
): Promise<File> {
  const session = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = await navigator.storage.getDirectory();
  // reclaim space from killed runs before writing
  await sweepOrphans(dir);
  await reportStorage('start');
  const videoName = muxName(session, 'v.bin');
  const audioName = muxName(session, 'a.bin');
  const outName = muxName(session, 'out.mp4');

  const drop = (name: string) => dir.removeEntry(name).catch(() => {});

  // combine both tracks for accurate progress
  let videoRecv = 0;
  let videoTotal = 0;
  let audioRecv = 0;
  let audioTotal = 0;
  const emitProgress = () => {
    const received = videoRecv + audioRecv;
    const total = videoTotal + audioTotal;
    if (total > 0) {
      post(
        Math.min(90, Math.round((received / total) * 90)),
        'Downloading...',
        { received, total }
      );
    }
  };

  try {
    const [videoFile, audioFile] = await Promise.all([
      fetchToDisk(dir, job.videoUrl, videoName, signal, (received, total) => {
        videoRecv = received;
        videoTotal = total;
        emitProgress();
      }),
      fetchToDisk(dir, job.audioUrl, audioName, signal, (received, total) => {
        audioRecv = received;
        audioTotal = total;
        emitProgress();
      }),
    ]);

    const file = await muxToDisk(
      dir,
      videoFile,
      audioFile,
      outName,
      job,
      signal
    );
    await drop(videoName);
    await drop(audioName);
    return file;
  } catch (err) {
    const quota = (err as { name?: string })?.name === 'QuotaExceededError';
    try {
      const est = await navigator.storage?.estimate?.();
      if (est) {
        ctx.postMessage({
          type: 'diag',
          tag: 'error',
          usage: est.usage,
          quota: est.quota,
        });
        if (
          quota &&
          typeof (err as { ceiling?: number }).ceiling !== 'number'
        ) {
          (err as { ceiling?: number }).ceiling = est.usage;
        }
      }
    } catch {
      // ignore estimate failure
    }
    await drop(videoName);
    await drop(audioName);
    await drop(outName);
    throw err;
  }
}

let activeController: AbortController | null = null;

ctx.onmessage = (event: MessageEvent) => {
  const data = event.data as { type?: string };
  if (data?.type === 'cancel') {
    activeController?.abort();
    return;
  }
  if (data?.type !== 'start') return;

  const controller = new AbortController();
  activeController = controller;
  runJob(event.data as MuxStartMessage, controller.signal)
    .then((file) => ctx.postMessage({ type: 'done', file }))
    .catch((err: unknown) => {
      const error = err as Error & { ceiling?: number };
      ctx.postMessage({
        type: 'error',
        name: error?.name,
        message: error?.message,
        ceiling: error?.ceiling,
      });
    })
    .finally(() => {
      if (activeController === controller) activeController = null;
    });
};
