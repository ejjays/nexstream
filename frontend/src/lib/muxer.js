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
  await ffmpeg.writeFile("v_in", videoBlob);

  onProgress("downloading", 30, { subStatus: "Fetching Audio Stream..." });
  const audioBlob = await fetchFile(audioUrl, {}, fetchOptions);
  console.log(`[Muxer] Audio stream downloaded: ${audioBlob.byteLength} bytes`);
  await ffmpeg.writeFile("a_in", audioBlob);

  onProgress("downloading", 50, { subStatus: "Muxing Streams..." });
  
  const result = await ffmpeg.exec([
    "-i",
    "v_in",
    "-i",
    "a_in",
    "-c",
    "copy",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-f",
    "mp4",
    "-shortest",
    "out.mp4",
  ]);
  console.log(`[Muxer] FFmpeg exec result: ${result}`);

  const data = await ffmpeg.readFile("out.mp4");
  console.log(`[Muxer] Muxing complete. Blob size: ${data.length} bytes`);
  return new Blob([data], { type: "video/mp4" });
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
  await ffmpeg.writeFile("audio_in", audioBlob);

  onProgress("downloading", 40, { subStatus: "Encoding MP3..." });
  const resultMp3 = await ffmpeg.exec([
    "-i",
    "audio_in",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    "out.mp3",
  ]);
  console.log(`[Muxer] FFmpeg exec result: ${resultMp3}`);

  const data = await ffmpeg.readFile("out.mp3");
  console.log(`[Muxer] Transcoding complete. Blob size: ${data.length} bytes`);
  return new Blob([data], { type: "audio/mpeg" });
};
