import LibAV from '@imput/libav.js-remux-cli';

const runFetchAction = (
  url,
  onProgress,
  startPct,
  endPct,
  subStatus,
  onChunk
) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/fetch-worker.js');
    let received = 0;
    let total = 0;
    const chunks = [];

    worker.postMessage({ url });

    worker.onmessage = e => {
      const { type, chunk, contentLength, message } = e.data;
      if (type === 'start') {
        total = contentLength;
      } else if (type === 'chunk') {
        received += chunk.byteLength;
        if (onChunk) {
          onChunk(chunk);
        } else {
          chunks.push(chunk);
        }

        if (total) {
          const pct = received / total;
          const currentPct = startPct + pct * (endPct - startPct);
          if (Math.random() < 0.1 || received === total) {
            onProgress('downloading', currentPct, {
              subStatus: `${subStatus}: ${Math.round(pct * 100)}%`
            });
          }
        }
      } else if (type === 'done') {
        worker.terminate();
        if (onChunk) {
          resolve(received);
        } else {
          const combined = new Uint8Array(received);
          let pos = 0;
          for (let c of chunks) {
            combined.set(c, pos);
            pos += c.length;
          }
          resolve(combined);
        }
      } else if (type === 'error') {
        worker.terminate();
        reject(new Error(message));
      }
    };
  });
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

  onProgress('initializing', 5, { subStatus: 'Loading LibAV Core' });
  const libav = await LibAV.LibAV({ base: '/libav' });
  try {
    const [videoData, audioData] = await Promise.all([
      runFetchAction(videoUrl, onProgress, 10, 40, 'Downloading Video'),
      runFetchAction(audioUrl, onProgress, 45, 75, 'Downloading Audio')
    ]);

    onProgress('downloading', 80, { subStatus: 'Stitching Streams' });
    const isWebm = outputName.toLowerCase().endsWith('.webm');
    const internalOutputName = isWebm ? 'output.webm' : 'output.mp4';

    await libav.writeFile('video_in', videoData);
    await libav.writeFile('audio_in', audioData);
    await libav.mkwriterdev(internalOutputName);

    libav.onwrite = (name, pos, data) => {
      if (name === internalOutputName && onChunk) {
        onChunk(new Uint8Array(data.slice().buffer));
      }
    };

    const ffmpegArgs = [
      '-i',
      'video_in',
      '-i',
      'audio_in',
      '-c',
      'copy',
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-shortest',
      '-y'
    ];

    if (isWebm) {
      ffmpegArgs.push('-f', 'webm', internalOutputName);
    } else {
      ffmpegArgs.push(
        '-f',
        'mp4',
        '-movflags',
        'frag_keyframe+empty_moov+default_base_moof',
        internalOutputName
      );
    }

    await libav.ffmpeg(ffmpegArgs);

    await libav.unlink('video_in');
    await libav.unlink('audio_in');

    onProgress('downloading', 100, { subStatus: 'Finalizing' });
    return true;
  } finally {
    await libav.terminate();
  }
};

export const processAudioOnly = async (
  audioUrl,
  coverUrl,
  outputName,
  onProgress,
  onLog,
  onChunk,
  onReady
) => {
  if (onReady) onReady();

  onProgress('downloading', 10, { subStatus: 'Opening High-Speed Bitstream' });

  const totalSize = await runFetchAction(
    audioUrl,
    onProgress,
    10,
    100,
    'Streaming High-Fidelity Audio',
    onChunk
  );

  onProgress('downloading', 100, { subStatus: 'Complete' });
  return totalSize;
};
