import { Innertube, Platform } from 'youtubei.js';
import vm from 'node:vm';

let cachedClient: Innertube | null = null;

/**
 * platform setup
 * loopback bypass
 */
const setupPlatform = () => {
  if (Platform.shim) {
    /* eslint-disable @typescript-eslint/no-explicit-any, sonarjs/code-eval */
    Platform.shim.eval = (data: any, env: any) => {
      // robust function wrapper
      const fn = vm.runInNewContext(`(function(${Object.keys(env).join(', ')}) { ${data.output} })`, {});
      return fn(...Object.values(env));
    };
    /* eslint-enable @typescript-eslint/no-explicit-any, sonarjs/code-eval */
  }
};

setupPlatform();

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const _createInnertube = async (config?: any): Promise<Innertube> => {
  setupPlatform();
  return await Innertube.create({
    generate_session_locally: true,
    enable_safety_mode: false,
    // prevent jit stalls
    enable_jit_fallback: false,
    ...config,
  });
};

export async function getYoutubeClient(): Promise<Innertube> {
  if (cachedClient) return cachedClient;

  try {
    cachedClient = await _createInnertube();
    return cachedClient;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[YouTubeClient] Init failed: ${message}`);
    throw error;
  }
}
