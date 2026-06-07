import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tiktok } from '../../src/services/extractors/index.js';

// live test, real tiktok fetch
// run on residential ip not datacenter
const RUN = process.env.LIVE_TEST === '1';
const ldescribe = RUN ? describe : describe.skip;

// tiktok captchas direct ips; opt in
const TT_ENABLED = process.env.TIKTOK_LIVE === '1';

interface LiveUrlEntry {
  url: string;
  note?: string;
}

// volatile urls live in one editable json
const liveUrls = JSON.parse(
  readFileSync(
    new URL('../fixtures/live-extractor-urls.json', import.meta.url),
    'utf8'
  )
) as Record<string, LiveUrlEntry>;

const TT_URL = process.env.TIKTOK_LIVE_URL || liveUrls.tiktok?.url;

ldescribe('tiktok extractor (live)', () => {
  it(
    'resolves a real tiktok video (set TIKTOK_LIVE=1; needs clean ip/proxy)',
    async (ctx) => {
      if (!TT_ENABLED) {
        ctx.skip();
        return;
      }
      expect(TT_URL, 'no tiktok url in fixtures').toBeTruthy();
      const info = await tiktok.getInfo(TT_URL, {});

      expect(
        info,
        'null — tiktok served captcha (needs clean ip/proxy)'
      ).toBeTruthy();
      expect(info?.title, 'no title resolved').toBeTruthy();
      // canary for tiktok page changes
      expect(
        info?.formats?.length ?? 0,
        'no formats — tiktok changed or captcha'
      ).toBeGreaterThan(0);

      console.log(
        `[live] tiktok OK: "${info?.title}" — ${info?.formats?.length} format(s)`
      );
    },
    60000
  );
});
