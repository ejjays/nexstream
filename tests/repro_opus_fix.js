const { spawn } = require("node:child_process");
const axios = require("axios");

async function runTest() {
  const videoUrl = "https://www.youtube.com/watch?v=hVvEISFw9w0";
  console.log("[Test] Fetching real stream URLs via yt-dlp...");
  
  const getUrl = (cmd) => new Promise((res) => {
    let out = "";
    const p = spawn("yt-dlp", cmd);
    p.stdout.on("data", d => out += d);
    p.on("close", () => res(out.trim()));
  });

  const audioUrl = await getUrl(["-f", "251", "-g", videoUrl]);
  const coverUrl = "https://lh3.googleusercontent.com/a/default-user=s88-c";

  if (!audioUrl) {
    console.error("[Test] Failed to get audio URL. yt-dlp might be failing.");
    process.exit(1);
  }

  console.log("[Test] Attempting FFmpeg Mux (WebM + Opus + Cover)...");

  // This matches the logic I intend to implement:
  // We add -analyzeduration and -probesize to fix the "Error parsing Opus packet header"
  const args = [
    "-hide_banner",
    "-loglevel", "info",
    "-analyzeduration", "20M",
    "-probesize", "20M",
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", audioUrl,
    "-i", coverUrl,
    "-map", "0:a:0",
    "-map", "1:0",
    "-c:a", "libopus", // Transcoding Opus ensures the header is rewritten correctly
    "-b:a", "128k",
    "-c:v", "webp",    // WebM likes WebP or VP8/9 for covers
    "-f", "webm",
    "-shortest",
    "pipe:1"
  ];

  const ff = spawn("ffmpeg", args);
  let bytes = 0;
  let errorLog = "";

  ff.stdout.on("data", d => bytes += d.length);
  ff.stderr.on("data", d => errorLog += d.toString());

  setTimeout(() => {
    ff.kill();
    console.log(`[Test] Received ${bytes} bytes.`);
    if (bytes > 0 && !errorLog.includes("Error parsing Opus packet header")) {
      console.log("[Test] SUCCESS: Stream established without Opus errors.");
      process.exit(0);
    } else {
      console.error("[Test] FAILED:", errorLog);
      process.exit(1);
    }
  }, 5000);
}

runTest();
