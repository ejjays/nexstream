import type { File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';

export async function saveToDevice(source: File): Promise<boolean> {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) return false;
  await MediaLibrary.saveToLibraryAsync(source.uri);
  return true;
}
