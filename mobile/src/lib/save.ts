import type { File } from 'expo-file-system';
import {
  requestPermissionsAsync,
  saveToLibraryAsync,
} from 'expo-media-library/legacy';
import {
  StorageAccessFramework,
  readAsStringAsync,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DIR_KEY = 'nexstream.saf.dir';
const AUDIO_EXT = new Set(['mp3', 'm4a', 'aac', 'opus', 'ogg']);
const CHUNK = 3 * 1024 * 1024;

function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a' || ext === 'aac') return 'audio/mp4';
  if (ext === 'webm') return 'video/webm';
  return 'video/mp4';
}

async function getSaveDir(): Promise<string | null> {
  const saved = await AsyncStorage.getItem(DIR_KEY).catch(() => null);
  if (saved) return saved;
  const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perm.granted) return null;
  await AsyncStorage.setItem(DIR_KEY, perm.directoryUri).catch(() => undefined);
  return perm.directoryUri;
}

/*
 * streams in small slices to prevent OOM crashes on large files (e.g., 80MB video).
 * required cuz copyAsync cannot write directly to SAF content:// URIs.
 * uses read-slice + append; CHUNK size must be a multiple of 3 so base64
 * pieces lack padding & concatenate seamlessly.
 */
async function streamToSaf(source: File, destUri: string): Promise<void> {
  const size = source.size ?? 0;
  let offset = 0;
  while (offset < size) {
    const length = Math.min(CHUNK, size - offset);
    const chunk = await readAsStringAsync(source.uri, {
      encoding: EncodingType.Base64,
      position: offset,
      length,
    });
    await writeAsStringAsync(destUri, chunk, {
      encoding: EncodingType.Base64,
      append: offset > 0,
    });
    offset += length;
  }
}

async function saveToFolder(source: File): Promise<boolean> {
  const dir = await getSaveDir();
  if (!dir) return false;
  try {
    const stem = source.name.replace(/\.[^.]+$/u, '');
    const target = await StorageAccessFramework.createFileAsync(
      dir,
      stem,
      mimeFor(source.name)
    );
    await streamToSaf(source, target);
    console.log(`[save] folder: ${source.name}`);
    return true;
  } catch (error) {
    await AsyncStorage.removeItem(DIR_KEY).catch(() => undefined);
    console.error(
      `[save] folder save failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/*
 * Expo MediaLibrary only reliably supports images, not general files.
 * rejects audio outright, and some Android builds reject video with
 * "MIME type... expected image/*" errors.
 * solution: audio goes straight to SAF. video tries MediaLibrary first,
 * falling back to SAF if it fails.
 */
export async function saveToDevice(source: File): Promise<boolean> {
  const ext = source.name.split('.').pop()?.toLowerCase() ?? '';

  /* gallery rejects audio; saf folder instead */
  if (AUDIO_EXT.has(ext)) return saveToFolder(source);

  try {
    const perm = await requestPermissionsAsync();
    if (perm.granted) {
      await saveToLibraryAsync(source.uri);
      console.log(`[save] gallery: ${source.name}`);
      return true;
    }
    console.warn(`[save] permission denied (status=${perm.status})`);
  } catch (error) {
    console.warn(
      `[save] gallery failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return saveToFolder(source);
}
