// shared copy-mux core used by both the main-thread path (muxer.ts)
// and the worker path (mux.worker.ts). only the input source and output
// target differ between the two, so those are passed in.
import {
  type Input,
  Output,
  Mp4OutputFormat,
  type BufferTarget,
  type StreamTarget,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  type EncodedPacket,
} from 'mediabunny';
import { shouldVetoCopyMux, UnsupportedMuxCodecError } from './mux-codecs';

export interface MuxTags {
  title?: string;
  artist?: string;
  album?: string;
}

export interface CopyMuxParams {
  videoInput: Input;
  audioInput: Input;
  target: BufferTarget | StreamTarget;
  metadata?: MuxTags;
  durationHint?: number;
  signal?: AbortSignal;
  // pct runs 90..100 during muxing
  onProgress?: (pct: number, detail: string) => void;
}

// walk packets, applying a timestamp offset
export async function pumpTrack(
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
      offset > 0
        ? packet.clone({ timestamp: packet.timestamp + offset })
        : packet;
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

// copy video + audio into a fragmented mp4 on the given target, no re-encode
export async function copyMuxTracks(params: CopyMuxParams): Promise<void> {
  const {
    videoInput,
    audioInput,
    target,
    metadata,
    durationHint,
    signal,
    onProgress,
  } = params;

  const videoTrack = await videoInput.getPrimaryVideoTrack();
  const audioTrack = await audioInput.getPrimaryAudioTrack();
  if (!videoTrack) throw new Error('No video track in source');
  if (!audioTrack) throw new Error('No audio track in source');

  const videoCodec = await videoTrack.getCodec();
  const audioCodec = await audioTrack.getCodec();
  if (!videoCodec || !audioCodec) throw new Error('Unsupported source codec');

  // bail to the server for combos mp4 can't copy
  const verdict = shouldVetoCopyMux(videoCodec, audioCodec);
  if (verdict.veto) {
    throw new UnsupportedMuxCodecError(
      `Source codecs not copy-safe for mp4 (${verdict.reason})`
    );
  }

  const videoConfig = await videoTrack.getDecoderConfig();
  const audioConfig = await audioTrack.getDecoderConfig();
  if (!videoConfig || !audioConfig) throw new Error('Missing decoder config');

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented' }),
    target,
  });
  const videoSource = new EncodedVideoPacketSource(videoCodec);
  const audioSource = new EncodedAudioPacketSource(audioCodec);
  output.addVideoTrack(videoSource);
  output.addAudioTrack(audioSource);

  const tags: MuxTags = {};
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
  // pull negative start timestamps up so the mp4 starts at zero
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
}
