import AsyncStorage from '@react-native-async-storage/async-storage';

const COOKIE_KEY = 'nexstream.bilibili.cookie';

export async function getBilibiliCookie(): Promise<string> {
  const stored = await AsyncStorage.getItem(COOKIE_KEY).catch(() => null);
  if (stored && stored.trim()) return stored.trim();
  return (process.env.EXPO_PUBLIC_BILIBILI_COOKIE ?? '').trim();
}

export async function setBilibiliCookie(value: string): Promise<void> {
  await AsyncStorage.setItem(COOKIE_KEY, value.trim()).catch(() => undefined);
}
