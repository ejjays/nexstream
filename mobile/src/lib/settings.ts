export function getBilibiliCookie(): string {
  return (process.env.EXPO_PUBLIC_BILIBILI_COOKIE ?? '').trim();
}
