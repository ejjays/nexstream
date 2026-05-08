import LibAV from '@imput/libav.js-remux-cli';
import { OPFSStorage } from './opfs';

class LibAVWrapper {
  private libav: any = null;
  private onProgress?: any;

  constructor(onProgress?: any) {
    this.libav = null;
    this.onProgress = onProgress;
  }

  async init() {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        this.libav = await (LibAV as any).LibAV({ base: '/libav' });
        return this.libav;
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
  }

  async probe(blobOrFile: any) {
    if (!this.libav) await this.init();
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

  async writeFile(name: string, data: any) {
    if (!this.libav) await this.init();
    await this.libav.writeFile(name, data);
  }

  async terminate() {
    if (this.libav) {
      await this.libav.terminate();
      this.libav = null;
    }
  }
}

const runFetchAction = async (
  url: string,
  onProgress: any,
  startPct: number,
  endPct: number,
  subStatus: string,
  storageName: string
): Promise<any> => {
  return new Promise(async (resolve, reject) => {
    const worker = new Worker('/fetch-worker.js');
    let total = 0;
    let fallbackStorage: any = null;

    // check browser compat
    const root = await navigator.storage.getDirectory();
    const processingDir = await root.getDirectoryHandle(
      'nexstream-processing',
      { create: true }
    );

    // check chromium
    const isChromium = !!(window as any).chrome;

    worker.postMessage({ url, storageName: isChromium ? storageName : null });

    worker.onmessage = async e => {
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
          fallbackStorage.write(chunk);
        }
      } else if (type === 'done') {
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
          } catch (err: any) {
            fetch(`/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: `EME_FETCH_OPFS_ERROR_${err.message}` }) }).catch(()=>{});
            reject(new Error(`OPFS Error: ${err.message}`));
          }
        } else if (fallbackStorage) {
          const file = await fallbackStorage.getFile();
          resolve({ file, filename: fallbackStorage.filename });
        } else {
          fetch(`/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: `EME_FETCH_NO_DATA_RECEIVED` }) }).catch(()=>{});
          reject(new Error('Worker failed: No data received.'));
        }
      } else if (type === 'error') {
        worker.terminate();
        if (fallbackStorage) await fallbackStorage.delete();
        fetch(`/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: `EME_WORKER_ERROR_${message}` }) }).catch(()=>{});
        reject(new Error(`Worker error: ${message || 'Unknown'}`));
      }
    };
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

export const processAudioOnly = async (
  audioUrl: string,
  metadata: any = {},
  onProgress: any,
  onLog?: any,
  onChunk?: any,
  onReady?: any
) => {
  if (onReady) onReady();
  const wrapper = new LibAVWrapper();
  let audioEntry: any = null;

  try {
    const ff = await wrapper.init();
    const aResult = await runFetchAction(audioUrl, onProgress, 10, 80, `Audio`, 'audio_only');
    audioEntry = aResult;

    let ext = audioEntry.filename.split('.').pop();
    if (!['mp3', 'm4a', 'webm', 'ogg'].includes(ext)) {
      ext = 'm4a'; // default ext
    }
    const internalOutput = `output.${ext}`;
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
  } catch (err: any) {
    console.error('[Muxer] Audio Process Error:', err);
    throw err;
  } finally {
    try {
      const root = await navigator.storage.getDirectory();
      const processingDir = await root.getDirectoryHandle(
        'nexstream-processing'
      );
      if (audioEntry?.filename)
        await processingDir.removeEntry(audioEntry.filename);
    } catch (e) {}
    await wrapper.terminate();
  }
};
