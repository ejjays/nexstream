import { installYtProxy } from '../../services/ytdlp/yt-proxy.js';

// avoid first-request innertube latency
export async function warmYoutubeClient(): Promise<void> {
  if (process.env.DISABLE_YT_JS === '1') {
    console.log('[Warmup] Innertube skipped (DISABLE_YT_JS set)');
    return;
  }
  const warmStart = Date.now();
  try {
    const { getYoutubeClient, getYoutubeExtractorClient } =
      await import('../../services/extractors/youtube/client.js');
    // also warm extractor: caches potoken
    await Promise.all([getYoutubeClient(), getYoutubeExtractorClient()]);
    console.log(
      `[Warmup] Innertube client ready in ${Date.now() - warmStart}ms`
    );
  } catch (error) {
    console.warn(
      '[Warmup] Innertube pre-warm failed (will retry on first request):',
      error instanceof Error ? error.message : error
    );
  }
}

// avoid first-request lazy-load delay
export async function warmHotPathModules(): Promise<void> {
  const warmStart = Date.now();
  try {
    await Promise.all([
      import('../../services/extractors/index.js'),
      import('../api/response.util.js'),
      import('../../services/ytdlp/config.js'),
      import('../network/cookie.util.js'),
    ]);
    console.log(
      `[Warmup] Hot-path modules ready in ${Date.now() - warmStart}ms`
    );
  } catch (error) {
    console.warn(
      '[Warmup] Hot-path module prewarm failed:',
      error instanceof Error ? error.message : error
    );
  }
}

// warm caches at boot
export function warmUp(): void {
  installYtProxy();
  void warmYoutubeClient();
  void warmHotPathModules();
}
