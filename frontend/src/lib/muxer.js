import LibAV from '@imput/libav.js-remux-cli';

const handleWorkerMessage = (e, ctx) => {
  const { type, chunk, contentLength, message } = e.data;
  const { onChunk, onProgress, startPct, endPct, subStatus, chunks, resolve, reject, worker } = ctx;

  if (type === 'start') {
    ctx.total = contentLength;
  } else if (type === 'chunk') {
    ctx.received += chunk.byteLength;
    if (onChunk) {
      onChunk(chunk);
    } else {
      chunks.push(chunk);
    }

    if (ctx.total) {
      const pct = ctx.received / ctx.total;
      const currentPct = startPct + pct * (endPct - startPct);
      const randomVal = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF;
      if (randomVal < 0.1 || ctx.received === ctx.total) {
        onProgress('downloading', currentPct, {
          subStatus: `${subStatus}: ${Math.round(pct * 100)}%`
        });
      }
    }
  } else if (type === 'done') {
    worker.terminate();
    if (onChunk) {
      resolve(ctx.received);
    } else {
      const combined = new Uint8Array(ctx.received);
      let pos = 0;
      for (let c of chunks) {
        combined.set(new Uint8Array(c), pos);
        pos += c.byteLength;
      }
      resolve(combined);
    }
  } else if (type === 'error') {
    worker.terminate();
    reject(new Error(message));
  }
};

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
    const ctx = {
      received: 0,
      total: 0,
      chunks: [],
      onChunk,
      onProgress,
      startPct,
      endPct,
      subStatus,
      resolve,
      reject,
      worker
    };

    worker.postMessage({ url });
    worker.onmessage = e => handleWorkerMessage(e, ctx);
  });
};

async function setupMuxInputs(libav, videoData, audioData) {
  await libav.writeFile('video_in', videoData);
  await libav.writeFile('audio_in', audioData);
}

function getMuxArgs(isWebm, outputName) {
  const args = [
    '-i', 'video_in',
    '-i', 'audio_in',
    '-c', 'copy',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-shortest',
    '-y'
  ];

  if (isWebm) {
    args.push('-f', 'webm', outputName);
  } else {
    args.push(
      '-f', 'mp4',
      '-movflags', '+faststart',
      outputName
    );
  }
  return args;
}

export const muxVideoAudio = async (
  videoUrl,
  audioUrl,
  outputName,
  onProgress,
  onLog,
  onChunk, // Keep for signature compatibility
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

    onProgress('downloading', 80, { subStatus: 'Stitching Streams (Wait...)' });
    const isWebm = outputName.toLowerCase().endsWith('.webm');
    const internalOutputName = isWebm ? 'output.webm' : 'output.mp4';

    await setupMuxInputs(libav, videoData, audioData);

    // Muxing to internal virtual filesystem (ensures seekability)
    await libav.ffmpeg(getMuxArgs(isWebm, internalOutputName));

    onProgress('downloading', 95, { subStatus: 'Finalizing Seekable File' });
    
    // Read the finished, seekable file
    const finalizedData = await libav.readFile(internalOutputName);
    
    if (onChunk) {
      onChunk(new Uint8Array(finalizedData.buffer));
    }

    await libav.unlink('video_in');
    await libav.unlink('audio_in');
    await libav.unlink(internalOutputName);

    onProgress('downloading', 100, { subStatus: 'Complete' });
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
