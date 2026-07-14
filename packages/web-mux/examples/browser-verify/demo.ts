import { muxToMp4 } from '../../dist/index.js';
import { Input, BlobSource, ALL_FORMATS } from 'mediabunny';

interface MuxCheck {
  ok: boolean;
  error?: string;
  source: string;
  size?: number;
  type?: string;
  hasVideo?: boolean;
  hasAudio?: boolean;
  duration?: number;
  usedWorker: boolean;
}

interface SourcePair {
  name: string;
  videoUrl: string;
  audioUrl: string;
}

declare global {
  interface Window {
    __muxResults?: MuxCheck[];
  }
}

const SOURCES: SourcePair[] = [
  { name: 'synthetic (ffmpeg)', videoUrl: '/video-only.mp4', audioUrl: '/audio-only.mp4' },
  { name: 'real youtube dash', videoUrl: '/real-video.mp4', audioUrl: '/real-audio.m4a' },
];

async function tryPath(source: SourcePair, usedWorker: boolean): Promise<MuxCheck> {
  try {
    const blob = await muxToMp4({
      videoUrl: source.videoUrl,
      audioUrl: source.audioUrl,
      metadata: { title: 'web-mux verify', artist: 'test' },
      workerUrl: usedWorker
        ? new URL('../../dist/worker.js', import.meta.url)
        : undefined,
      filePrefix: usedWorker ? 'verify-worker' : 'verify-main',
    });

    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();

    return {
      ok: true,
      source: source.name,
      size: blob.size,
      type: blob.type,
      hasVideo: !!videoTrack,
      hasAudio: !!audioTrack,
      duration,
      usedWorker,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message, source: source.name, usedWorker };
  }
}

async function run() {
  const results: MuxCheck[] = [];
  for (const source of SOURCES) {
    results.push(await tryPath(source, true));
    results.push(await tryPath(source, false));
  }
  window.__muxResults = results;
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = JSON.stringify(results);
}

run();
