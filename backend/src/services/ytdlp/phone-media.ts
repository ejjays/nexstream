/**
 * phone-side media routing.
 *
 * relays googlevideo through the residential ip
 * to save bandwidth and dodge proxy bans.
 * falls back to backend if phone is offline.
 */
import { createHmac } from 'node:crypto';
import { secureFetch } from '../../utils/network/security.util.js';
import { resolvePhoneTunnelUrl } from './remote-ytdlp.js';

const SECRET = process.env.YTDLP_REMOTE_SECRET?.trim() || '';
const ENABLED = process.env.PHONE_MEDIA_ENABLED === '1';
const MEDIA_TTL_MS =
  (Number(process.env.PROXY_URL_TTL_SECONDS) || 21600) * 1000;
const HEALTH_INTERVAL_MS = 25_000;

let healthy = false;
let tunnelUrl = '';
let pingerStarted = false;

async function pingHealth(): Promise<void> {
  const url = await resolvePhoneTunnelUrl();
  if (!url) {
    healthy = false;
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await secureFetch(`${url.replace(/\/+$/u, '')}/health`, {
      signal: controller.signal,
    });
    healthy = res.ok;
    if (res.ok) tunnelUrl = url;
  } catch {
    healthy = false;
  } finally {
    clearTimeout(timeout);
  }
}

function ensurePinger(): void {
  if (pingerStarted) return;
  pingerStarted = true;
  void pingHealth();
  const timer = setInterval(() => void pingHealth(), HEALTH_INTERVAL_MS);
  timer.unref?.();
}

function isGooglevideo(rawUrl: string): boolean {
  try {
    return /(^|\.)googlevideo\.com$/iu.test(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

export function phoneMediaReady(): boolean {
  if (!ENABLED || !SECRET) return false;
  ensurePinger();
  return healthy && tunnelUrl.length > 0;
}

export function buildPhoneMediaUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl || !isGooglevideo(rawUrl) || !phoneMediaReady()) return null;
  const exp = Date.now() + MEDIA_TTL_MS;
  const sig = createHmac('sha256', SECRET)
    .update(`${rawUrl}\n${exp}`)
    .digest('base64url');
  const base = tunnelUrl.replace(/\/+$/u, '');
  return `${base}/media?u=${encodeURIComponent(rawUrl)}&e=${exp}&s=${sig}`;
}
