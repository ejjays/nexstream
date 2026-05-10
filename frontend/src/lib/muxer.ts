import LibAV from '@imput/libav.js-remux-cli';
import { OPFSStorage } from './opfs';

interface LibAVInstance {
  mkreadaheadfile: (name: string, data: Blob | File) => Promise<void>;
  ffprobe: (args: string[]) => Promise<unknown>;
  unlinkreadaheadfile: (name: string) => Promise<void>;
  writeFile: (name: string, data: Uint8Array) => Promise<void>;
  terminate: () => Promise<void>;
  mkwriterdev: (name: string) => Promise<void>;
  ffmpeg: (args: string[]) => Promise<void>;
  onwrite?: (name: string, pos: number, data: Uint8Array) => void;
  onprint?: (text: string) => void;
}

type ProgressCallback = (status: string, progress: number, details?: { subStatus: string }) => void;

class LibAVWrapper {
  private libav: LibAVInstance | null = null;
  private onProgress?: ProgressCallback;

  constructor(onProgress?: ProgressCallback) {
    this.libav = null;
    this.onProgress = onProgress;
  }

  async init(): Promise<LibAVInstance> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        const instance = await (LibAV as unknown as { LibAV: (opts: { base: string }) => Promise<LibAVInstance> }).LibAV({ base: '/libav' });
        this.libav = instance;
        return instance;
      } catch (err) {
        attempts++;
        console.warn(
          `[EME] LibAV init failed (attempt ${attempts}/${maxAttempts}):`,
          err
        );
        if (attempts === maxAttempts)
          throw new Error('LibAV worker failed to start after 10 attempts.');
        await new Promise(r => setTimeout(r, 200));
      }
    }
    throw new Error('LibAV initialization failed');
  }

  async probe(blobOrFile: Blob | File) {
    if (!this.libav) await this.init();
    if (!this.libav) throw new Error('LibAV not initialized');
    
    const fname = `probe_${Math.random().toString(36).slice(2)}`;
    await this.libav.mkreadaheadfile(fname, blobOrFile);

    try {
      const result = await this.libav.ffprobe([
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        fname
      ]);
      return result;
    } finally {
      await this.libav.unlinkreadaheadfile(fname);
    }
  }

  async writeFile(name: string, data: Uint8Array) {
    if (!this.libav) await this.init();
    if (this.libav) await this.libav.writeFile(name, data);
  }

  async terminate() {
    if (this.libav) {
      await this.libav.terminate();
      this.libav = null;
    }
  }
}

interface FetchResult {
  file: File;
  filename: string;
}

interface FetchWorkerMessage {
  type: 'start' | 'progress' | 'chunk' | 'done' | 'error';
  contentLength: number;
  message?: string;
  received: number;
  filename?: string;
  chunk?: Uint8Array;
}

const runFetchAction = async (
  url: string,
  onProgress: ProgressCallback,
  startPct: number,
  endPct: number,
  subStatus: string,
  storageName: string
): Promise<FetchResult> => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const worker = new Worker('/fetch-worker.js');
        let total = 0;
        let fallbackStorage: OPFSStorage | null = null;

        // check browser compat
        const root = await navigator.storage.getDirectory();
        const processingDir = await root.getDirectoryHandle(
          'nexstream-processing',
          { create: true }
        );

        // check chromium
        const isChromium = !!(window as unknown as { chrome?: unknown }).chrome;

        worker.postMessage({ url, storageName: isChromium ? storageName : null });

        worker.onmessage = async (e: MessageEvent<FetchWorkerMessage>) => {
          const { type, contentLength, message, received, filename, chunk } =
            e.data;

          if (type === 'start') {
            total = contentLength;
            if (!isChromium) {
              // fallback opfs storage
              fallbackStorage = await OPFSStorage.init(
                storageName || 'stream',
                false
              );
            }
          } else if (type === 'progress') {
            if (total > 0) {
              const pct = received / total;
              const currentPct = startPct + pct * (endPct - startPct);
              onProgress('downloading', currentPct, {
                subStatus: `${getTS()} [EME] ${subStatus}: ${(
                  received /
                  1024 /
                  1024
                ).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(
                  1
                )}MB (${Math.round(pct * 100)}%)`
              });
            }
          } else if (type === 'chunk') {
            if (fallbackStorage && chunk) {
              const safeChunk = chunk.buffer instanceof SharedArrayBuffer 
                ? new Uint8Array(chunk) 
                : chunk;
              fallbackStorage.write(safeChunk as any);
            }
          } else if (type === 'done') {
            worker.onmessage = null;
            worker.terminate();
            if (isChromium && filename) {
              try {
                const handle = await processingDir.getFileHandle(filename);
                const file = await handle.getFile();
                if (file.size < 1000) {
                  const err = new Error(`${subStatus} failed: Stream is empty.`);
                  fetch(`/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: `EME_FETCH_EMPTY_STREAM_${filename}` }) }).catch(()=>{});
                  reject(err);
                } else {
                  resolve({ file, filename });
                }
              } catch (err: unknown) {
                const error = err as Error;
                fetch(`/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: `EME_FETCH_OPFS_ERROR_${error.message}` }) }).catch(()=>{});
                reject(new Error(`OPFS Error: ${error.message}`));
              }
            } else if (fallbackStorage) {
              const file = await fallbackStorage.getFile();
              resolve({ file, filename: fallbackStorage.filename });
            } else {
              fetch(`/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: `EME_FETCH_NO_DATA_RECEIVED` }) }).catch(()=>{});
              reject(new Error('Worker failed: No data received.'));
            }
          } else if (type === 'error') {
            worker.onmessage = null;
            worker.terminate();
            if (fallbackStorage) await fallbackStorage.delete();
            fetch(`/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: `EME_WORKER_ERROR_${message}` }) }).catch(()=>{});
            reject(new Error(`Worker error: ${message || 'Unknown'}`));
          }
        };
      } catch (err: unknown) {
        reject(err as Error);
      }
    })();
  });
};

const getTS = () => {
  const n = new Date();
  return `[${n.getHours().toString().padStart(2, '0')}:${n
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${n.getSeconds().toString().padStart(2, '0')}.${n
    .getMilliseconds()
    .toString()
    .padStart(3, '0')}]`;
};

interface MuxerMetadata {
  title?: string;
  artist?: string;
  album?: string;
  coverBlob?: Blob;
}

export const processAudioOnly = async (
  audioUrl: string,
  metadata: MuxerMetadata = {},
  onProgress: ProgressCallback,
  onLog?: (msg: string) => void,
  onChunk?: (chunk: Uint8Array) => void,
  onReady?: () => void
) => {
  if (onReady) onReady();
  const wrapper = new LibAVWrapper();
  let audioEntry: FetchResult | null = null;

  try {
    const ff = await wrapper.init();
    const aResult = await runFetchAction(audioUrl, onProgress, 10, 80, `Audio`, 'audio_only');
    audioEntry = aResult;

    const ext = audioEntry.filename.split('.').pop() || 'm4a';
    const internalOutput = `output.${['mp3', 'm4a', 'webm', 'ogg'].includes(ext) ? ext : 'm4a'}`;
    await ff.mkreadaheadfile('input_audio', audioEntry.file);

    const muxArgs = [
      '-i',
      'input_audio',
      '-c',
      'copy',
      '-metadata',
      `title=${metadata.title || ''}`,
      '-metadata',
      `artist=${metadata.artist || ''}`,
      '-metadata',
      `album=${metadata.album || ''}`,
      '-id3v2_version',
      '3',
      '-y',
      internalOutput
    ];

    // handle cover art
    if (metadata.coverBlob) {
      await wrapper.writeFile(
        'cover.jpg',
        new Uint8Array(await metadata.coverBlob.arrayBuffer())
      );
      muxArgs.splice(2, 0, '-i', 'cover.jpg', '-map', '0', '-map', '1');
      muxArgs.splice(
        muxArgs.indexOf('-c') + 1,
        0,
        'copy',
        '-c:v',
        'copy',
        '-disposition:v',
        'attached_pic'
      );
    }

    const muxedStorage = await OPFSStorage.init(
      `audio-${internalOutput}`,
      true
    );
    ff.onwrite = (name: string, pos: number, data: Uint8Array) => {
      if (name === internalOutput && muxedStorage) return muxedStorage.write(data.slice(), pos);
    };
    await ff.mkwriterdev(internalOutput);

    ff.onprint = (text: string) => {
      if (text.includes('time=')) {
        const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (match) {
          const h = parseInt(match[1]);
          const m = parseInt(match[2]);
          const s = parseFloat(match[3]);
          const totalSeconds = h * 3600 + m * 60 + s;
          onProgress('downloading', 90, {
            subStatus: `${getTS()} [EME] Processing: ${totalSeconds.toFixed(1)}s`
          });
        }
      }
    };

    onProgress('downloading', 85, {
      subStatus: `${getTS()} [EME] Embedding Metadata...`
    });
    await ff.ffmpeg(muxArgs);
    if (muxedStorage) await muxedStorage.close();

    const finalFile = muxedStorage ? await muxedStorage.getFile() : null;

    onProgress('downloading', 100, {
      subStatus: `${getTS()} [EME] Success: Core Complete`
    });

    return { file: finalFile, size: finalFile?.size || 0 };
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[Muxer] Audio Process Error:', error);
    throw error;
  } finally {
    try {
      const root = await navigator.storage.getDirectory();
      const processingDir = await root.getDirectoryHandle(
        'nexstream-processing'
      );
      if (audioEntry?.filename)
        await processingDir.removeEntry(audioEntry.filename);
    } catch (_e) {}
    await wrapper.terminate();
  }
};
