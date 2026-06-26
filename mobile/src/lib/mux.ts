import type { File } from 'expo-file-system';
import {
  FFmpegKit,
  FFmpegKitConfig,
  Level,
  ReturnCode,
} from '@nikhil-cephei/ffmpeg-kit-react-native';

function fsPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//u, ''));
}

/* video+audio -> one container, no re-encode */
export async function muxVideoAudio(
  video: File,
  audio: File,
  out: File
): Promise<boolean> {
  const faststart = out.name.toLowerCase().endsWith('.mp4')
    ? ' -movflags +faststart'
    : '';
  const cmd = `-hide_banner -loglevel error -y -i "${fsPath(video.uri)}" -i "${fsPath(audio.uri)}" -c copy${faststart} "${fsPath(out.uri)}"`;

  const session = await FFmpegKit.execute(cmd);
  const code = await session.getReturnCode();
  if (ReturnCode.isSuccess(code)) return true;

  const output = await session.getOutput();
  console.warn(`[mux] ffmpeg failed (${code}): ${String(output).slice(-600)}`);
  return false;
}

/* container compatibility, not extra quality */
export async function transcodeToMp3(src: File, out: File): Promise<boolean> {
  const cmd = `-hide_banner -loglevel error -y -i "${fsPath(src.uri)}" -vn -c:a libmp3lame -q:a 2 "${fsPath(out.uri)}"`;
  const session = await FFmpegKit.execute(cmd);
  const code = await session.getReturnCode();
  if (ReturnCode.isSuccess(code)) return true;

  const output = await session.getOutput();
  console.warn(`[mp3] ffmpeg failed (${code}): ${String(output).slice(-600)}`);
  return false;
}

const HLS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* hls playlist -> one mp4, no re-encode; optional separate audio playlist */
export function hlsToMp4(
  url: string,
  out: File,
  durationSec: number,
  onProgress: (pct: number) => void,
  audioUrl?: string,
  keepAlive?: boolean
): Promise<boolean> {
  // ffmpeg-kit echoes every segment fetch; floods dev console
  void FFmpegKitConfig.setLogLevel(Level.AV_LOG_ERROR);
  // vimeo splits video & audio playlists; map both when present
  const inputs = audioUrl
    ? `-i "${url}" -i "${audioUrl}" -map 0:v:0 -map 1:a:0`
    : `-i "${url}"`;
  // reuse connection on same-host segments; off avoids cross-host redirect stalls
  const persistent = keepAlive ? '1' : '0';
  const cmd = `-hide_banner -loglevel error -y -http_persistent ${persistent} -user_agent "${HLS_UA}" ${inputs} -c copy -bsf:a aac_adtstoasc -movflags +faststart "${fsPath(out.uri)}"`;
  return new Promise((resolve) => {
    FFmpegKit.executeAsync(
      cmd,
      async (session) => {
        const code = await session.getReturnCode();
        if (ReturnCode.isSuccess(code)) {
          resolve(true);
          return;
        }
        const output = await session.getOutput();
        console.warn(
          `[hls] ffmpeg failed (${code}): ${String(output).slice(-600)}`
        );
        resolve(false);
      },
      undefined,
      (stats: { getTime: () => number }) => {
        if (durationSec <= 0) return;
        const pct = Math.round((stats.getTime() / 1000 / durationSec) * 100);
        if (pct > 0) onProgress(Math.min(99, pct));
      }
    );
  });
}
