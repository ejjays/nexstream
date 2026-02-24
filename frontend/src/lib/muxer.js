import LibAV from "@imput/libav.js-remux-cli";

const runFetchStream = (url, onProgress, startPct, endPct, subStatus) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/fetch-worker.js');
    worker.postMessage({ url });

    worker.onmessage = (e) => {
      const { type, stream, contentLength, message } = e.data;
      if (type === 'error') {
        worker.terminate();
        reject(new Error(message));
      } else if (type === 'stream') {
        let received = 0;
        const trackedStream = stream.pipeThrough(new TransformStream({
          transform(chunk, controller) {
            received += chunk.byteLength;
            if (contentLength) {
              const pct = (received / contentLength);
              const currentPct = startPct + (pct * (endPct - startPct));
              if (Math.random() < 0.05 || received === contentLength) {
                 onProgress("downloading", currentPct, { 
                    subStatus: `${subStatus}: ${Math.round(pct * 100)}%` 
                 });
              }
            }
            controller.enqueue(chunk);
          }
        }));
        resolve({ stream: trackedStream, contentLength, worker });
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
  onChunk
) => {
  onProgress("initializing", 5, { subStatus: "Loading LibAV Core" });
  const libav = await LibAV.LibAV({ base: '/libav' });
  try {
    const [{ stream: vStream }, { stream: aStream }] = await Promise.all([
        runFetchStream(videoUrl, onProgress, 10, 40, "Downloading Video"),
        runFetchStream(audioUrl, onProgress, 45, 75, "Downloading Audio")
    ]);

    onProgress("downloading", 80, { subStatus: "Stitching Streams" });
    
    const [vBlob, aBlob] = await Promise.all([
        new Response(vStream).blob(),
        new Response(aStream).blob()
    ]);

    await libav.mkreadaheadfile('video.mp4', vBlob);
    await libav.mkreadaheadfile('audio.m4a', aBlob);
    await libav.mkwriterdev('output.mp4');
    
    const CHUNK_SIZE = 1024 * 1024; 
    let buffer = new Uint8Array(0);

    libav.onwrite = (name, pos, data) => {
        if (name === 'output.mp4' && onChunk) {
            const newBuffer = new Uint8Array(buffer.length + data.byteLength);
            newBuffer.set(buffer);
            newBuffer.set(data, buffer.length);
            buffer = newBuffer;

            if (buffer.length >= CHUNK_SIZE) {
                onChunk(buffer);
                buffer = new Uint8Array(0);
            }
        }
    };
    
    await libav.ffmpeg([
      '-i', 'video.mp4',
      '-i', 'audio.m4a',
      '-c', 'copy',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-shortest',
      '-y',
      'output.mp4'
    ]);
    
    if (buffer.length > 0 && onChunk) {
        onChunk(buffer);
    }

    onProgress("downloading", 100, { subStatus: "Finalizing" });
    return true;
  } finally {
    await libav.terminate();
  }
};

export const transcodeToMp3 = async (audioUrl, outputName, onProgress, onLog, onChunk) => {
  onProgress("downloading", 10, { subStatus: "Fetching Audio" });
  const { stream, contentLength } = await runFetchStream(audioUrl, onProgress, 10, 95, "Downloading");
  
  const reader = stream.getReader();
  while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (onChunk) onChunk(value);
  }
  
  onProgress("downloading", 100, { subStatus: "Complete" });
  return contentLength; 
};
