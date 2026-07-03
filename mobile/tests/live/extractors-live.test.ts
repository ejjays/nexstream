import { describe, it, expect } from 'vitest';
import cases from './live-cases.json';
import { getInfo as facebookGetInfo } from '../../src/extractors/facebook';
import { getInfo as threadsGetInfo } from '../../src/extractors/threads';
import { getInfo as xGetInfo } from '../../src/extractors/x';
import { ExtractorError, type VideoInfo } from '../../src/extractors/types';

const RESOLVERS = {
  facebook: facebookGetInfo,
  threads: threadsGetInfo,
  x: xGetInfo,
} satisfies Record<string, (url: string) => Promise<VideoInfo | null>>;

type LiveCase = {
  name: string;
  extractor: keyof typeof RESOLVERS;
  url: string;
  expect: { minFormats: number; rejectUploader?: string };
};

const RUN_LIVE = process.env.VITEST_INCLUDE_LIVE === '1';

// ExtractorError from CI's datacenter IP = bot-wall, not our bug — skip, not fail.
// only earns its keep on residential IP (phone / residential-proxy runner).
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
      // real video stream, not a thumbnail/photo fallback
      expect(video.formats.some((format) => format.isVideo)).toBe(true);
      for (const format of video.formats) {
        expect(format.url).toMatch(/^https?:\/\//u);
      }
    });
  }
});
