import { describe, it, expect, vi } from 'vitest';
import cases from './live-cases.json';

// authFetch's cookieGet is native (rn fetch drops manual Cookie headers); shim
// to node fetch here since node keeps them — only instagram uses authFetch.
vi.mock('../../src/lib/authFetch', () => ({
  cookieGet: async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { headers });
    return {
      ok: res.ok,
      status: res.status,
      text: () => res.text(),
      json: () => res.json(),
    };
  },
}));

import { getInfo as facebookGetInfo } from '../../src/extractors/facebook';
import { getInfo as threadsGetInfo } from '../../src/extractors/threads';
import { getInfo as xGetInfo } from '../../src/extractors/x';
import { getInfo as tiktokGetInfo } from '../../src/extractors/tiktok';
import { getInfo as vimeoGetInfo } from '../../src/extractors/vimeo';
import { getInfo as dailymotionGetInfo } from '../../src/extractors/dailymotion';
import { getInfo as soundcloudGetInfo } from '../../src/extractors/soundcloud';
import { getInfo as redditGetInfo } from '../../src/extractors/reddit';
import { getInfo as blueskyGetInfo } from '../../src/extractors/bluesky';
import { getInfo as instagramGetInfo } from '../../src/extractors/instagram';
import { ExtractorError, type VideoInfo } from '../../src/extractors/types';

const RESOLVERS = {
  facebook: facebookGetInfo,
  threads: threadsGetInfo,
  x: xGetInfo,
  tiktok: tiktokGetInfo,
  vimeo: vimeoGetInfo,
  dailymotion: dailymotionGetInfo,
  soundcloud: soundcloudGetInfo,
  reddit: redditGetInfo,
  bluesky: blueskyGetInfo,
  instagram: instagramGetInfo,
} satisfies Record<string, (url: string) => Promise<VideoInfo | null>>;

type LiveCase = {
  name: string;
  extractor: keyof typeof RESOLVERS;
  url: string;
  expect: { minFormats: number; mediaKind?: 'video' | 'audio'; rejectUploader?: string };
};

const RUN_LIVE = process.env.VITEST_INCLUDE_LIVE === '1';

// ExtractorError on CI's datacenter IP = bot-wall, not our bug — skip, not fail.
describe.skipIf(!RUN_LIVE)('live extractor health', () => {
  for (const testCase of cases as LiveCase[]) {
    it(testCase.name, { timeout: 45000, retry: 2 }, async (ctx) => {
      const resolve = RESOLVERS[testCase.extractor];
      let info: VideoInfo | null;
      try {
        info = await resolve(testCase.url);
      } catch (error) {
        if (error instanceof ExtractorError) {
          ctx.skip(`upstream blocked (${error.message})`);
          return;
        }
        throw error;
      }

      expect(info, 'resolver returned null for a supported host').not.toBeNull();
      const video = info as VideoInfo;
      // reject logged-out fallback (e.g. fb's generic "Facebook User")
      if (testCase.expect.rejectUploader) {
        expect(video.uploader).not.toBe(testCase.expect.rejectUploader);
      }
      expect(video.title.trim().length).toBeGreaterThan(0);
      expect(video.formats.length).toBeGreaterThanOrEqual(
        testCase.expect.minFormats
      );
      // real media stream, not a thumbnail/photo fallback
      const wantAudio = testCase.expect.mediaKind === 'audio';
      expect(
        video.formats.some((format) =>
          wantAudio ? format.isAudio : format.isVideo
        )
      ).toBe(true);
      for (const format of video.formats) {
        expect(format.url).toMatch(/^https?:\/\//u);
      }
    });
  }
});

// youtube + spotify only resolve via on-device WebView (BotGuard+cipher) — never headless.
describe('live (webview-only extractors)', () => {
  it.todo('youtube — WebView-only, not headless-testable');
  it.todo('spotify — WebView-only (audio via youtube), not headless-testable');
});
