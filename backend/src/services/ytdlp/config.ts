import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { secureFetch } from '../../utils/network/security.util.js';

export const TEMP_DIR = path.join(__dirname, '../../../temp');
export const CACHE_DIR = path.join(TEMP_DIR, 'yt-dlp-cache');

export const COMMON_ARGS = [
  '--ignore-config',
  '--no-playlist',
  '--force-ipv4',
  '--no-check-certificates',
  '--no-warnings',
  '--socket-timeout',
  '20',
  '--retries',
  '5',
  '--fragment-retries',
  '5',
  '--buffer-size',
  '1M',
  '--http-chunk-size',
  '10M',
  '--concurrent-fragments',
  '8',
  '--throttled-rate',
  '100K',
  '--no-colors',
  '--mark-watched',
  '--geo-bypass',
  '--no-video-multistreams',
  '--no-check-formats',
  '--format',
  'bestvideo+bestaudio/best',
];

// skip plugins when pot disabled
if (process.env.ENABLE_POT_PLUGIN !== '1') {
  COMMON_ARGS.push('--no-plugin-dirs');
}

const defaultCookiesPath = path.join(TEMP_DIR, 'cookies.txt');
const envCookiesPath = process.env.YTDLP_COOKIES_FILE;

if (envCookiesPath && fs.existsSync(envCookiesPath)) {
  console.log(`[YtdlpConfig] Using cookies from ENV: ${envCookiesPath}`);
  COMMON_ARGS.push('--cookies', envCookiesPath);
} else if (fs.existsSync(defaultCookiesPath)) {
  console.log(
    `[YtdlpConfig] Using cookies from DEFAULT: ${defaultCookiesPath}`
  );
  COMMON_ARGS.push('--cookies', defaultCookiesPath);
} else {
  console.log('[YtdlpConfig] No cookies file found');
}

export async function bootstrapCookies(): Promise<void> {
  if (COMMON_ARGS.includes('--cookies')) return;
  const url = process.env.COOKIES_URL;
  if (!url) return;
  try {
    const cleanUrl = url.replace(/\/+$/, '');
    let res = await secureFetch(`${cleanUrl}/youtube_cookies.txt`);
    if (!res.ok) res = await secureFetch(cleanUrl);
    if (!res.ok) return;
    let text = await res.text();
    if (!text.includes('youtube.com')) return;
    // fix malformed header for yt-dlp compatibility
    if (!text.startsWith('# Netscape HTTP Cookie File')) {
      text = text.replace(/^#[^\n]*\n/, '# Netscape HTTP Cookie File\n');
    }
    fs.mkdirSync(path.dirname(defaultCookiesPath), { recursive: true });
    fs.writeFileSync(defaultCookiesPath, text);
    COMMON_ARGS.push('--cookies', defaultCookiesPath);
    console.log('[YtdlpConfig] Cookies fetched from remote');
  } catch {
    // non-critical, proceed without
  }
}

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export const REFERER_MAP: Record<string, string> = {
  'facebook.com': 'https://www.facebook.com/',
  'bilibili.com': 'https://www.bilibili.com/',
  'x.com': 'https://x.com/',
};
