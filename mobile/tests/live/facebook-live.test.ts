import { describe, it, expect } from 'vitest';
import cases from './live-cases.json';
import { getInfo as facebookGetInfo } from '../../src/extractors/facebook';
import { ExtractorError, type VideoInfo } from '../../src/extractors/types';

type LiveCase = {
  name: string;
  extractor: keyof typeof RESOLVERS;
  url: string;
  expect: { minFormats: number };
};

const RESOLVERS = {
  facebook: facebookGetInfo,
} satisfies Record<string, (url: string) => Promise<VideoInfo | null>>;

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
      expect(video.title.trim().length).toBeGreaterThan(0);
      expect(video.formats.length).toBeGreaterThanOrEqual(
        testCase.expect.minFormats
      );
      for (const format of video.formats) {
        expect(format.url).toMatch(/^https?:\/\//u);
      }
    });
  }
});
