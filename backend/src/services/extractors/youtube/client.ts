import vm from 'node:vm';
import fs from 'node:fs';
import { downloadCookies } from '../../../utils/cookie.util.js';

let youtube: unknown = null;
let Innertube: unknown, UniversalCache: unknown, Platform: unknown, Log: unknown;

async function getCookieString(): Promise<string> {
  try {
    const cookiesPath = await downloadCookies('youtube');
    if (cookiesPath && fs.existsSync(cookiesPath)) {
      const content = fs.readFileSync(cookiesPath, 'utf-8');
      return content.split('\n')
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
          const parts = line.split('\t');
          if (parts.length < 7) return null;
          return `${parts[5]}=${parts[6]}`;
        }).filter(Boolean).join('; ');
    }
  } catch (e: unknown) {
    const error = e as Error;
    console.warn('[JS-YT] Could not load cookies for Innertube:', error.message);
  }
  return '';
}

export async function getYoutubeInstance(): Promise<unknown> {
  if (youtube) return youtube;
  
  if (!Innertube) {
    const module = await import('youtubei.js');
    Innertube = module.Innertube;
    UniversalCache = module.UniversalCache;
    Platform = module.Platform;
    Log = module.Log;
  }
  
  // skip dashboard
  Log.setLevel(Log.Level.NONE);
  const cookie = await getCookieString();

  Platform.shim.eval = (data: unknown, env: unknown): unknown => {
    try {
      const { code, output } = data as { code?: string; output?: string };
      const script = code ?? output;
      if (typeof script !== 'string') return null;
      const context = {
        ...(env as Record<string, unknown>),
        console, URL, WebAssembly, Buffer,
        process: { env: {} },
        setTimeout, clearTimeout
      };
      return vm.runInNewContext(script, context);
    } catch (e: unknown) {
      const err = e as Error;
      if (err.message.includes('return')) {
        try {
          const { code, output } = data as { code?: string; output?: string };
          const script = code ?? output;
          if (typeof script !== 'string') return null;
          return vm.runInNewContext(`(function(){${script}})()`, { ...(env as Record<string, unknown>), console });
        } catch (inner: unknown) {
          const innerErr = inner as Error;
          console.error('[JS-YT] Decipher VM IIFE Error:', innerErr.message);
        }
      }
      console.error('[JS-YT] Decipher VM Error:', err.message);
      return null;
    }
  };

  youtube = await Innertube.create({ 
    cache: new UniversalCache(false),
    generate_session_locally: true,
    cookie: cookie
  });

  youtube.session.on('undici:error', () => {});
  youtube.session.on('undici:warning', () => {});
  
  return youtube;
}
