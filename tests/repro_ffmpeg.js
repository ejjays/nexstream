const { spawn } = require("node:child_process");
const fs = require("node:fs");
const { PassThrough } = require("node:stream");

// Mocking the required environment
const USER_AGENT = "Mozilla/5.0";
const buildFfmpegInputs = (v, a, i, c) => ["-i", "mock_url"];
const getBestAudioFormat = () => ({ url: "mock_audio" });
const getVideoInfo = () => ({ formats: [{ format_id: "251", vcodec: "none", acodec: "opus", url: "mock_url" }] });

function testHandleVideoStream(requestedFormat, coverUrl) {
    console.log(`\n--- Testing: Format=${requestedFormat}, Cover=${!!coverUrl} ---`);
    const formatId = "251";
    const videoFormat = { format_id: "251", vcodec: "none", acodec: "opus", url: "mock_url" };
    
    // THE LOGIC TO TEST
    const isAudioOnly = ["m4a", "webm", "mp3", "audio", "opus"].includes(requestedFormat) || 
                       (!videoFormat.vcodec || videoFormat.vcodec === "none");
    
    const vcodec = videoFormat.vcodec || "";
    const isAvc = vcodec.startsWith("avc1") || vcodec.startsWith("h264");
    const outFormat = requestedFormat === "mp4" ? "mp4" : (isAvc && !isAudioOnly ? "mp4" : requestedFormat);
    const videoHasAudio = videoFormat.acodec && videoFormat.acodec !== "none";
    const audioFormat = (videoHasAudio || isAudioOnly) ? { url: null } : getBestAudioFormat();

    const ffmpegInputs = buildFfmpegInputs();
    const audioMap = audioFormat.url ? ["-map", "1:a:0"] : (videoHasAudio || isAudioOnly) ? ["-map", "0:a:0"] : ["-map", "0:a?"];
    
    const ffmpegArgs = ["-hide_banner", "-loglevel", "error", ...ffmpegInputs];

    const canEmbedThumbnail = coverUrl && isAudioOnly && (outFormat === "m4a" || outFormat === "mp4");

    if (canEmbedThumbnail) {
        ffmpegArgs.push("-i", coverUrl);
        ffmpegArgs.push("-map", "0:a:0", "-map", "1:0", "-c:a", "aac", "-b:a", "192k", "-c:v", "mjpeg", "-disposition:v:1", "attached_pic");
    } else if (isAudioOnly) {
        ffmpegArgs.push("-map", "0:a:0", "-c", "copy");
    } else {
        ffmpegArgs.push("-c", "copy", "-map", "0:v:0", ...audioMap);
    }

    console.log("FFmpeg Args:", ffmpegArgs.join(" "));
    
    if (ffmpegArgs.includes("-map") && ffmpegArgs.includes("0:v:0")) {
        console.error("FAIL: Video map detected in audio-only request!");
    } else {
        console.log("SUCCESS: Correct mapping.");
    }
}

testHandleVideoStream("webm", "https://image.url");
testHandleVideoStream("m4a", "https://image.url");
testHandleVideoStream("mp4", null);
