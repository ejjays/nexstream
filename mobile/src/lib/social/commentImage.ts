import { File, Paths } from 'expo-file-system';
import ReactNativeBlobUtil from 'react-native-blob-util';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { FFmpegKit, ReturnCode } from '@nikhil-cephei/ffmpeg-kit-react-native';
import { supabase } from './supabase';
import { warn as logWarn } from '../log';

function fsPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//u, ''));
}

// cap longest edge & webp q80 — visually lossless, ~10x smaller than the original
const MAX_EDGE = 1080;
const WEBP_QUALITY = 80;

// opens the native gallery sheet; returns a local file uri, or null if cancelled
export async function pickCommentImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

// resize + re-encode to webp on-device via ffmpeg (libwebp); caller deletes result.
// min() guards keep small images from upscaling; decrease preserves aspect.
async function compressToWebp(srcUri: string): Promise<File> {
  const out = new File(Paths.cache, `cimg-${Crypto.randomUUID()}.webp`);
  const scale = `scale=w='min(${MAX_EDGE},iw)':h='min(${MAX_EDGE},ih)':force_original_aspect_ratio=decrease`;
  const cmd = `-hide_banner -loglevel error -y -i "${fsPath(srcUri)}" -vf "${scale}" -c:v libwebp -quality ${WEBP_QUALITY} "${fsPath(out.uri)}"`;
  const session = await FFmpegKit.execute(cmd);
  const code = await session.getReturnCode();
  if (ReturnCode.isSuccess(code) && out.exists) return out;
  const output = await session.getOutput();
  logWarn(
    'commentImage',
    `[webp] ffmpeg failed (${code}): ${String(output).slice(-400)}`
  );
  if (out.exists) out.delete();
  throw new Error('Could not process image');
}

// ask the edge function for a one-time R2 upload URL, stream the file up (no RAM
// buffering), return the public URL to store in comments.image_url
async function uploadToR2(webp: File): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke('r2-upload-url', {
    body: {},
  });
  if (error) throw error;
  const { uploadUrl, publicUrl } = data as {
    uploadUrl: string;
    publicUrl: string;
  };
  const res = await ReactNativeBlobUtil.fetch(
    'PUT',
    uploadUrl,
    { 'Content-Type': 'image/webp' },
    ReactNativeBlobUtil.wrap(fsPath(webp.uri))
  );
  const status = res.info().status;
  if (status < 200 || status >= 300) throw new Error(`upload failed (${status})`);
  return publicUrl;
}

// compress -> upload -> delete temp (even on failure); returns public R2 url
export async function uploadCommentImage(localUri: string): Promise<string> {
  const webp = await compressToWebp(localUri);
  try {
    return await uploadToR2(webp);
  } finally {
    if (webp.exists) webp.delete();
  }
}
