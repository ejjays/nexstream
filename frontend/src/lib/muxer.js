import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg = null;

export const getFFmpeg = async (onLog = () => {}) => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => {
    onLog(message);
  });

  try {
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    
    const loadPromise = ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("FFmpeg load timeout")), 15000)
    );

    await Promise.race([loadPromise, timeoutPromise]);
  } catch (err) {
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

  onProgress("initializing", 5, { subStatus: "Loading EME Core..." });

  ffmpeg.on("progress", ({ progress }) => {
    onProgress("downloading", 10 + progress * 80, {
      subStatus: `Stitching: ${Math.round(progress * 100)}%`,
    });
  });

  onProgress("downloading", 10, { subStatus: "Fetching Video Stream..." });
  const videoBlob = await fetchFile(videoUrl, {}, fetchOptions);
  await ffmpeg.writeFile("v_in", videoBlob);

  onProgress("downloading", 30, { subStatus: "Fetching Audio Stream..." });
  const audioBlob = await fetchFile(audioUrl, {}, fetchOptions);
  await ffmpeg.writeFile("a_in", audioBlob);

  onProgress("downloading", 50, { subStatus: "Synchronizing Streams..." });
  
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

  if (result !== 0) throw new Error("MUX_EXEC_FAILED");

  const data = await ffmpeg.readFile("out.mp4");
  return new Blob([data], { type: "video/mp4" });
};

export const transcodeToMp3 = async (audioUrl, outputName, onProgress, onLog, fetchOptions = {}) => {
  const ffmpeg = await getFFmpeg(onLog);

  onProgress("initializing", 5, { subStatus: "Loading EME Core..." });

  ffmpeg.on("progress", ({ progress }) => {
    onProgress("downloading", 10 + progress * 80, {
      subStatus: `Transcoding: ${Math.round(progress * 100)}%`,
    });
  });

  onProgress("downloading", 10, { subStatus: "Fetching Audio Stream..." });
  const audioBlob = await fetchFile(audioUrl, {}, fetchOptions);
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

  if (resultMp3 !== 0) throw new Error("TRANSCODE_EXEC_FAILED");

  const data = await ffmpeg.readFile("out.mp3");
  return new Blob([data], { type: "audio/mpeg" });
};