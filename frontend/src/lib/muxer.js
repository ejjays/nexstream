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
    const chunks = [];
    const ctx = {
      received: 0,
      total: 0,
    };

    worker.postMessage({ url });
    worker.onmessage = e => {
        const { type, chunk, contentLength, message } = e.data;
        if (type === 'start') {
            ctx.total = contentLength;
        } else if (type === 'chunk') {
            ctx.received += chunk.byteLength;
            if (onChunk) {
               onChunk(chunk);
            } else {
               chunks.push(chunk);
            }
            if (ctx.total > 0) {
                const receivedMB = (ctx.received / (1024 * 1024)).toFixed(1);
                const totalMB = (ctx.total / (1024 * 1024)).toFixed(1);
                const pct = ctx.received / ctx.total;
                const currentPct = startPct + pct * (endPct - startPct);
                onProgress('downloading', currentPct, {
                    subStatus: `${subStatus}: ${receivedMB}MB / ${totalMB}MB (${Math.round(pct * 100)}%)`
                });
            } else {
                const receivedMB = (ctx.received / (1024 * 1024)).toFixed(1);
                onProgress('downloading', startPct, {
                    subStatus: `${subStatus}: ${receivedMB}MB (Streaming...)`
                });
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
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
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
  onChunk,
  onReady
) => {
  if (onReady) onReady();

  onProgress('initializing', 5, { subStatus: '[EME] Booting LibAV WebAssembly Core' });
  const libav = await LibAV.LibAV({ base: '/libav' });
  
  try {
    onProgress('initializing', 10, { subStatus: '[EME] Core Ready. Negotiating Bitstreams' });
    
    const [videoData, audioData] = await Promise.all([
      runFetchAction(videoUrl, onProgress, 10, 40, '[EME] Resolving Video Buffer'),
      runFetchAction(audioUrl, onProgress, 45, 75, '[EME] Resolving Audio Buffer')
    ]);

    onProgress('downloading', 80, { subStatus: '[EME] Muxing: Interleaving A/V Frames (DO NOT CLOSE)' });
    const isWebm = outputName.toLowerCase().endsWith('.webm');
    const internalOutputName = isWebm ? 'output.webm' : 'output.mp4';

    await setupMuxInputs(libav, videoData, audioData);
    await libav.mkwriterdev(internalOutputName);

    libav.onwrite = (name, pos, data) => {
      if (name === internalOutputName && onChunk) {
        onChunk(new Uint8Array(data.slice().buffer));
      }
    };

    const muxArgs = getMuxArgs(isWebm, internalOutputName);
    muxArgs.unshift('-probesize', '32k', '-analyzeduration', '0');
    
    await libav.ffmpeg(muxArgs);

    await libav.unlink('video_in');
    await libav.unlink('audio_in');

    onProgress('downloading', 100, { subStatus: '[EME] Success: Virtual Container Generated' });
    return true;

  } catch (err) {
    console.error('[Muxer] Error:', err);
    throw err;
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
  onProgress('downloading', 10, { subStatus: '[EME] Initializing Direct Bitstream Pipe' });
  const totalSize = await runFetchAction(audioUrl, onProgress, 10, 100, '[EME] Pumping Data', onChunk);
  onProgress('downloading', 100, { subStatus: '[EME] Success: Pipe Closed' });
  return totalSize;
};
