import vm from 'node:vm';
import fs from 'node:fs';
import { downloadCookies } from '../../../utils/cookie.util.js';

let youtube: any = null;
let Innertube: any, UniversalCache: any, Platform: any, Log: any;

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

export async function getYoutubeInstance(): Promise<any> {
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

  Platform.shim.eval = (data: any, env: any) => {
    try {
      const code = data.code || data.output;
      const context = { 
        ...env, 
        console, URL, WebAssembly, Buffer,
        process: { env: {} },
        setTimeout, clearTimeout
      };
      return vm.runInNewContext(code, context);
    } catch (e: any) {
      if (e.message.includes('return')) {
         try {
           return vm.runInNewContext(`(function(){${data.code || data.output}})()`, { ...env, console });
         } catch (inner: any) {
           console.error('[JS-YT] Decipher VM IIFE Error:', inner.message);
         }
      }
      console.error('[JS-YT] Decipher VM Error:', e.message);
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
