import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const fsPromises = fs.promises;

export async function downloadImage(url: string, dest: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    await fsPromises.writeFile(dest, Buffer.from(arrayBuffer));
    return dest;
  } catch (err) {
    if (fs.existsSync(dest)) await fsPromises.unlink(dest).catch(() => {});
    throw err;
  }
}

export async function downloadImageToBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function injectMetadata(filePath: string, metadata: any): Promise<boolean> {
  return new Promise((resolve) => {
    const ext = path.extname(filePath),
      tempOut = filePath.replace(ext, `_tagged${ext}`),
      ffmpegArgs = ["-y", "-i", filePath];
    if (metadata.coverFile && fs.existsSync(metadata.coverFile))
      ffmpegArgs.push("-i", metadata.coverFile);
    ffmpegArgs.push("-map", "0:v?", "-map", "0:a");
    if (metadata.coverFile && fs.existsSync(metadata.coverFile))
      ffmpegArgs.push("-map", "1:0", "-disposition:v:1", "attached_pic");
    ["title", "artist", "album"].forEach((k) => {
      if (metadata[k]) ffmpegArgs.push("-metadata", `${k}=${metadata[k]}`);
    });
    if (metadata.year && metadata.year !== "Unknown")
      ffmpegArgs.push("-metadata", `date=${metadata.year}`);
    ffmpegArgs.push("-c", "copy", tempOut);
    const ff = spawn("ffmpeg", ffmpegArgs);
    ff.on("close", (code) => {
      if (code === 0 && fs.existsSync(tempOut)) {
        fs.renameSync(tempOut, filePath);
        return resolve(true);
      }
      if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
      resolve(false);
    });
  });
}
