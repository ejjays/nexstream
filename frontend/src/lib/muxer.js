import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg = null;

export const getFFmpeg = async (onLog = () => {}) => {
  if (ffmpeg) return ffmpeg;

  console.log("[Muxer] Initializing FFmpeg WASM...");
  ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => {
    console.log("[FFmpeg Log]", message);
    onLog(message);
  });

  try {
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    console.log("[Muxer] Loading core from:", baseURL);

    // Add a safety timeout for loading
    const loadPromise = ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("FFmpeg load timeout")), 10000)
    );

    await Promise.race([loadPromise, timeoutPromise]);
    console.log("[Muxer] FFmpeg WASM loaded successfully.");
  } catch (err) {
    console.error("[Muxer] Failed to load FFmpeg WASM:", err);
    throw err;
  }

  return ffmpeg;
};

export const muxVideoAudio = async (
  videoUrl,
  audioUrl,
  outputName,
  onProgress,
  onLog,
  fetchOptions = {},
) => {
  const ffmpeg = await getFFmpeg(onLog);

  onProgress("initializing", 5, { subStatus: "Loading FFmpeg WASM..." });

  ffmpeg.on("progress", ({ progress }) => {
    onProgress("downloading", 10 + progress * 80, {
      subStatus: `Muxing: ${Math.round(progress * 100)}%`,
    });
  });

  onProgress("downloading", 10, { subStatus: "Fetching Video Stream..." });
  const videoBlob = await fetchFile(videoUrl, {}, fetchOptions);
  console.log(`[Muxer] Video stream downloaded: ${videoBlob.byteLength} bytes`);
  await ffmpeg.writeFile("video.mp4", videoBlob);

  onProgress("downloading", 30, { subStatus: "Fetching Audio Stream..." });
  const audioBlob = await fetchFile(audioUrl, {}, fetchOptions);
  console.log(`[Muxer] Audio stream downloaded: ${audioBlob.byteLength} bytes`);
  await ffmpeg.writeFile("audio.mp4", audioBlob);

  onProgress("downloading", 50, { subStatus: "Muxing Streams..." });
  // Determine if re-encoding is necessary
  // Input video is VP9 WebM, Input audio is AAC MP4.
  // Output is desired to be MP4.
  // Re-encode video to H.264 (libx264) for MP4 compatibility, copy audio.
  await ffmpeg.exec([
    "-i",
    "video.mp4", // This is the webm (vp9) stream
    "-i",
    "audio.mp4", // This is the mp4 (aac) stream
    "-c:v",
    "libx264", // Re-encode video to h264 for MP4 compatibility
    "-preset",
    "fast", // Faster encoding, lower quality (can be tuned)
    "-crf",
    "23", // Constant Rate Factor (quality setting, 0-51, lower is better)
    "-c:a",
    "copy", // Copy audio stream
    "-map",
    "0:v:0", // Map video from input 0
    "-map",
    "1:a:0", // Map audio from input 1
    "-f",
    "mp4", // Explicitly set output format to MP4
    "-shortest",
    outputName,
  ]);
  console.log(`[Muxer] FFmpeg exec result: ${execResult}`);

  const data = await ffmpeg.readFile(outputName);
  return new Blob([data.buffer], { type: "video/mp4" });
};

export const transcodeToMp3 = async (audioUrl, outputName, onProgress, onLog, fetchOptions = {}) => {
  const ffmpeg = await getFFmpeg(onLog);

  ffmpeg.on("progress", ({ progress }) => {
    onProgress("downloading", 10 + progress * 80, {
      subStatus: `Transcoding: ${Math.round(progress * 100)}%`,
    });
  });

  onProgress("downloading", 10, { subStatus: "Fetching Audio Stream..." });
  const audioBlob = await fetchFile(audioUrl, {}, fetchOptions);
  console.log(`[Muxer] Audio stream downloaded: ${audioBlob.byteLength} bytes`);
  await ffmpeg.writeFile("input_audio", audioBlob);

  onProgress("downloading", 40, { subStatus: "Encoding MP3..." });
  const execResult = await ffmpeg.exec([
    "-i",
    "input_audio",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    outputName,
  ]);
  console.log(`[Muxer] FFmpeg exec result: ${execResult}`);

  const data = await ffmpeg.readFile(outputName);
  return new Blob([data.buffer], { type: "audio/mpeg" });
};
