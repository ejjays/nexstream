import AsyncStorage from '@react-native-async-storage/async-storage';

export function getBilibiliCookie(): string {
  return (process.env.EXPO_PUBLIC_BILIBILI_COOKIE ?? '').trim();
}

export type FilenameFormat = 'artist-title' | 'title' | 'title-platform';

const FORMAT_KEY = 'nexstream.filename.format';
const AUTOPASTE_KEY = 'nexstream.autopaste';
const NOTIFY_KEY = 'nexstream.notify';
const HAPTICS_KEY = 'nexstream.haptics';

export async function getFilenameFormat(): Promise<FilenameFormat> {
  const v = await AsyncStorage.getItem(FORMAT_KEY).catch(() => null);
  if (v === 'title' || v === 'title-platform') return v;
  return 'artist-title';
}

export async function setFilenameFormat(value: FilenameFormat): Promise<void> {
  await AsyncStorage.setItem(FORMAT_KEY, value).catch(() => undefined);
}

export async function getAutoPaste(): Promise<boolean> {
  const v = await AsyncStorage.getItem(AUTOPASTE_KEY).catch(() => null);
  return v === '1';
}

export async function setAutoPaste(value: boolean): Promise<void> {
  await AsyncStorage.setItem(AUTOPASTE_KEY, value ? '1' : '0').catch(
    () => undefined
  );
}

export async function getNotify(): Promise<boolean> {
  const v = await AsyncStorage.getItem(NOTIFY_KEY).catch(() => null);
  return v === '1';
}

export async function setNotify(value: boolean): Promise<void> {
  await AsyncStorage.setItem(NOTIFY_KEY, value ? '1' : '0').catch(
    () => undefined
  );
}

export async function getHaptics(): Promise<boolean> {
  const v = await AsyncStorage.getItem(HAPTICS_KEY).catch(() => null);
  return v !== '0';
}

export async function setHaptics(value: boolean): Promise<void> {
  await AsyncStorage.setItem(HAPTICS_KEY, value ? '1' : '0').catch(
    () => undefined
  );
}

export function formatName(
  fmt: FilenameFormat,
  title: string,
  artist: string | undefined,
  platform: string
): string {
  if (fmt === 'title') return title;
  if (fmt === 'title-platform') {
    const tag = platform.charAt(0).toUpperCase() + platform.slice(1);
    return `${title} (${tag})`;
  }
  return artist ? `${artist} - ${title}` : title;
}
