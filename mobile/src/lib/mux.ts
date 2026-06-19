import type { File } from 'expo-file-system';
import { FFmpegKit, ReturnCode } from '@nikhil-cephei/ffmpeg-kit-react-native';

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
