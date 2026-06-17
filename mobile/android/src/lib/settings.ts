import AsyncStorage from '@react-native-async-storage/async-storage';

const COOKIE_KEY = 'nexstream.bilibili.cookie';

export async function getBilibiliCookie(): Promise<string> {
  const value = await AsyncStorage.getItem(COOKIE_KEY).catch(() => null);
  return value ?? '';
}

export async function setBilibiliCookie(value: string): Promise<void> {
  await AsyncStorage.setItem(COOKIE_KEY, value.trim()).catch(() => undefined);
}
