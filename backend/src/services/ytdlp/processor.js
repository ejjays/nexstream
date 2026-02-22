const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const fsPromises = require("node:fs").promises;
const axios = require("axios");

async function downloadImage(url, dest) {
    try {
        const response = await axios.get(url, { responseType: "arraybuffer" });
        await fsPromises.writeFile(dest, response.data);
        return dest;
    } catch (err) {
        if (fs.existsSync(dest)) await fsPromises.unlink(dest).catch(() => {});
        throw err;
    }
}

async function downloadImageToBuffer(url) {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    return Buffer.from(response.data);
}

async function injectMetadata(filePath, metadata) {
    return new Promise(resolve => {
        const ext = path.extname(filePath), tempOut = filePath.replace(ext, `_tagged${ext}`), ffmpegArgs = ["-y", "-i", filePath];
        if (metadata.coverFile && fs.existsSync(metadata.coverFile)) ffmpegArgs.push("-i", metadata.coverFile);
        ffmpegArgs.push("-map", "0:v?", "-map", "0:a");
        if (metadata.coverFile && fs.existsSync(metadata.coverFile)) ffmpegArgs.push("-map", "1:0", "-disposition:v:1", "attached_pic");
        ["title", "artist", "album"].forEach(k => { if (metadata[k]) ffmpegArgs.push("-metadata", `${k}=${metadata[k]}`); });
        if (metadata.year && metadata.year !== "Unknown") ffmpegArgs.push("-metadata", `date=${metadata.year}`);
        ffmpegArgs.push("-c", "copy", tempOut);
        const ff = spawn("ffmpeg", ffmpegArgs);
        ff.on("close", code => {
            if (code === 0 && fs.existsSync(tempOut)) {
                fs.renameSync(tempOut, filePath); return resolve(true);
            }
            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); resolve(false);
        });
    });
}

module.exports = {
    downloadImage,
    downloadImageToBuffer,
    injectMetadata
};
