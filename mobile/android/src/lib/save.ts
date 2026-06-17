import type { File } from 'expo-file-system';

/* lazy import survives missing native */
export async function saveToDevice(source: File): Promise<boolean> {
  const MediaLibrary = await import('expo-media-library/legacy');
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) return false;
  await MediaLibrary.saveToLibraryAsync(source.uri);
  return true;
}
