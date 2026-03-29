import LibAV from '@imput/libav.js-remux-cli';
import { OPFSStorage } from './opfs';

class LibAVWrapper {
  constructor(onProgress) {
    this.libav = null;
    this.onProgress = onProgress;
    this.concurrency = Math.min(4, navigator.hardwareConcurrency || 2);
  }

  async init() {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        this.libav = await LibAV.LibAV({ base: '/libav' });
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

  async probe(blobOrFile) {
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

  async writeFile(name, data) {
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
  url,
  onProgress,
  startPct,
  endPct,
  subStatus,
  storageName
) => {
  return new Promise(async (resolve, reject) => {
    const worker = new Worker('/fetch-worker.js');
    let total = 0;
    let fallbackStorage = null;

    // check browser compat
    const root = await navigator.storage.getDirectory();
    const processingDir = await root.getDirectoryHandle(
      'nexstream-processing',
      { create: true }
    );

    // check chromium
    const isChromium = !!window.chrome;

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
              reject(new Error(`${subStatus} failed: Stream is empty.`));
            } else {
              resolve({ file, filename });
            }
          } catch (err) {
            reject(new Error(`OPFS Error: ${err.message}`));
          }
        } else if (fallbackStorage) {
          const file = await fallbackStorage.getFile();
          resolve({ file, filename: fallbackStorage.filename });
        } else {
          reject(new Error('Worker failed: No data received.'));
        }
      } else if (type === 'error') {
        worker.terminate();
        if (fallbackStorage) await fallbackStorage.delete();
        reject(new Error(`Worker error: ${message || 'Unknown'}`));
      }
    };
  });
};

function getMuxArgs(isWebm, outputName) {
  const args = [
    '-probesize', '32M',
    '-analyzeduration', '32M',
    '-i', 'input_video',
    '-i', 'input_audio',
    '-c', 'copy',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-map_metadata', '-1',
    '-fflags', '+genpts+igndts+bitexact',
    '-avoid_negative_ts', 'make_zero'
  ];

  if (isWebm) {
    args.push(
      '-f', 'matroska',
      '-shortest',
      '-y',
      outputName
    );
  } else {
    args.push(
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof+faststart',
      '-shortest',
      '-y',
      outputName
    );
  }
  return args;
}

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

export const muxVideoAudio = async (
  videoUrl,
  audioUrl,
  outputName,
  onProgress,
  onLog,
  onChunk,
  onReady
) => {
  if (onReady) onReady();

  const wrapper = new LibAVWrapper();

  let videoEntry = null;
  let audioEntry = null;

  try {
    console.log(`${getTS()} [Muxer] Initializing high-speed alignment...`);

    const [libav, vResult, aResult] = await Promise.all([
      wrapper.init().then(ff => {
        onProgress('initializing', 10, {
          subStatus: `${getTS()} [EME] Ignition: Core Ready`
        });
        return ff;
      }),
      runFetchAction(videoUrl, onProgress, 10, 45, `Video`, `video`),
      runFetchAction(audioUrl, onProgress, 45, 80, `Audio`, `audio`)
    ]);

    videoEntry = vResult;
    audioEntry = aResult;

    const isWebm = outputName.toLowerCase().endsWith('.webm');
    const internalOutputName = isWebm ? 'output.webm' : 'output.mp4';

    await libav.mkreadaheadfile('input_video', videoEntry.file);
    await libav.mkreadaheadfile('input_audio', audioEntry.file);

    const muxedStorage = await OPFSStorage.init(
      `muxed-${internalOutputName}`,
      true
    );

    libav.onwrite = (name, pos, data) => {
      if (name === internalOutputName) {
        return muxedStorage.write(data.slice(), pos);
      }
    };

    libav.onprint = (text) => {
      if (text.includes('time=')) {
        const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (match) {
          const h = parseInt(match[1]);
          const m = parseInt(match[2]);
          const s = parseFloat(match[3]);
          const totalSeconds = h * 3600 + m * 60 + s;
          onProgress('downloading', 90, {
            subStatus: `${getTS()} [EME] Muxing: ${totalSeconds.toFixed(1)}s`
          });
        }
      }
    };

    await libav.mkwriterdev(internalOutputName);

    const muxArgs = [
      '-nostdin',
      ...getMuxArgs(isWebm, internalOutputName)
    ];

    console.log(`${getTS()} [Muxer] Executing FFmpeg master command...`);
    await libav.ffmpeg(muxArgs);
    await muxedStorage.close();

    const finalFile = await muxedStorage.getFile();
    
    onProgress('downloading', 100, {
      subStatus: `${getTS()} [EME] Muxing Complete`
    });

    return { file: finalFile, size: finalFile.size };
  } catch (err) {
    console.error('[Muxer] Critical Error:', err);
    throw err;
  } finally {
    try {
      const root = await navigator.storage.getDirectory();
      const processingDir = await root.getDirectoryHandle(
        'nexstream-processing'
      );
      if (videoEntry?.filename)
        await processingDir.removeEntry(videoEntry.filename);
      if (audioEntry?.filename)
        await processingDir.removeEntry(audioEntry.filename);
    } catch (e) {}
    await wrapper.terminate();
  }
};

export const processAudioOnly = async (
  audioUrl,
  metadata = {},
  onProgress,
  onLog,
  onChunk,
  onReady
) => {
  if (onReady) onReady();
  const wrapper = new LibAVWrapper();
  let audioEntry = null;

  try {
    const [libav, aResult] = await Promise.all([
      wrapper.init(),
      runFetchAction(audioUrl, onProgress, 10, 80, `Audio`, 'audio_only')
    ]);
    audioEntry = aResult;

    const ext = audioEntry.filename.split('.').pop();
    const internalOutput = `output.${ext}`;
    await libav.mkreadaheadfile('input_audio', audioEntry.file);

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
      await libav.writeFile(
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
    libav.onwrite = (name, pos, data) => {
      if (name === internalOutput) return muxedStorage.write(data.slice(), pos);
    };
    await libav.mkwriterdev(internalOutput);

    libav.onprint = (text) => {
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
    await libav.ffmpeg(muxArgs);
    await muxedStorage.close();

    const finalFile = await muxedStorage.getFile();

    onProgress('downloading', 100, {
      subStatus: `${getTS()} [EME] Success: Core Complete`
    });

    return { file: finalFile, size: finalFile.size };
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
