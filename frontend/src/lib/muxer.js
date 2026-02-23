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
  
  // We use -c copy for INSTANT muxing because the backend now prioritizes
  // H.264 video and AAC audio which are native to the MP4 container.
  const execResult = await ffmpeg.exec([
    "-i",
    "video.mp4",
    "-i",
    "audio.mp4",
    "-c",
    "copy",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-f",
    "mp4",
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
