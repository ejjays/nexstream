import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEMP_DIR = path.join(__dirname, '../../../temp');
export const CACHE_DIR = path.join(TEMP_DIR, 'yt-dlp-cache');

export const COMMON_ARGS = [
  '--ignore-config',
  '--no-playlist',
  '--force-ipv4',
  '--no-check-certificates',
  '--no-warnings',
  '--socket-timeout',
  '15',
  '--retries',
  '10',
  '--fragment-retries',
  '10',
  '--buffer-size',
  '128K',
  '--http-chunk-size',
  '4M',
  '--no-colors',
  '--mark-watched',
  '--geo-bypass',
];

const defaultCookiesPath = path.join(TEMP_DIR, 'cookies.txt');
const envCookiesPath = process.env.YTDLP_COOKIES_FILE;

if (envCookiesPath && fs.existsSync(envCookiesPath)) {
  COMMON_ARGS.push('--cookies', envCookiesPath);
} else if (fs.existsSync(defaultCookiesPath)) {
  COMMON_ARGS.push('--cookies', defaultCookiesPath);
}

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export const REFERER_MAP: Record<string, string> = {
  'facebook.com': 'https://www.facebook.com/',
  'bilibili.com': 'https://www.bilibili.com/',
  'x.com': 'https://x.com/',
};
