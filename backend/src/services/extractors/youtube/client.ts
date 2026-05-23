import { Innertube, UniversalCache, Log, Platform } from 'youtubei.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, '../../../../temp');

let youtube: Innertube | null = null;

export async function getYoutubeClient(
  options: { po_token?: string; visitor_data?: string } = {}
) {
  if (youtube) return youtube;

  Log.setLevel(Log.Level.NONE);

  // shim signature JS
  Platform.shim.eval = (
    data: { output: string },
    env: Record<string, unknown>
  ) => {
    return new Function(...Object.keys(env), data.output)(
      ...Object.values(env)
    );
  };
  const cookiePath = path.join(TEMP_DIR, 'cookies.txt');
  let cookieString = '';

  if (fs.existsSync(cookiePath)) {
    try {
      const content = fs.readFileSync(cookiePath, 'utf8');
      const lines = content.split('\n');
      const pairs: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split('\t');
        if (parts.length >= 7) {
          pairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
        }
      }
      cookieString = pairs.join('; ');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[YouTubeClient] Failed to parse cookies: ${message}`);
    }
  }

  youtube = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
    cookie: cookieString || undefined,
    po_token: options.po_token,
    visitor_data: options.visitor_data,
  });

  return youtube;
}
