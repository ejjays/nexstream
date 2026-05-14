import { Innertube, UniversalCache, Log } from 'youtubei.js';
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "../../../../temp");

let youtube: Innertube | null = null;

interface LogType {
  setLevel: (level: number) => void;
  Level: { NONE: number };
}

interface InnertubeShim {
  Platform: {
    shim: {
      eval: (data: string, env: Record<string, unknown>) => string;
    }
  }
}

export async function getYoutubeClient() {
  if (youtube) return youtube;

  (Log as unknown as LogType).setLevel((Log as unknown as LogType).Level.NONE);

  const platform = (Innertube as unknown as InnertubeShim).Platform;
  if (platform && platform.shim) {
    platform.shim.eval = (data: string) => {
      return data;
    };
  }

  const cookiePath = path.join(TEMP_DIR, "cookies.txt");
  let cookieString = "";
  
  if (fs.existsSync(cookiePath)) {
    try {
      const content = fs.readFileSync(cookiePath, 'utf8');
      const lines = content.split('\n');
      const pairs: string[] = [];
      for (const line of lines) {
        if (!line.trim() || line.startsWith('#')) continue;
        const parts = line.split('\t');
        if (parts.length >= 7) pairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
      }
      cookieString = pairs.join('; ');
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.warn(`[YouTubeClient] Failed to parse cookies: ${e.message}`);
      } else {
        console.warn(`[YouTubeClient] Failed to parse cookies: ${String(e)}`);
      }
    }
  }

  youtube = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
    cookie: cookieString || undefined
  });

  return youtube;
}
