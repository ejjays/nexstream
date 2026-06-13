import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { instagram } from '../../src/services/extractors/index.js';

// live test, real instagram fetch
// run on residential ip not datacenter
const RUN = process.env.LIVE_TEST === '1';
const ldescribe = RUN ? describe : describe.skip;

// ig needs login cookie to resolve video
const IG_COOKIE = process.env.IG_LIVE_COOKIE;

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

const IG_URL = process.env.IG_LIVE_URL || liveUrls.instagram?.url;

ldescribe('instagram extractor (live)', () => {
  it('resolves a real instagram reel (set IG_LIVE_COOKIE to enable)', async (ctx) => {
    if (!IG_COOKIE) {
      ctx.skip();
      return;
    }
    expect(IG_URL, 'no instagram url in fixtures').toBeTruthy();
    const info = await instagram.getInfo(IG_URL, { cookie: IG_COOKIE });

    expect(info, 'extractor returned null — likely broken').toBeTruthy();
    expect(info?.title, 'no title resolved').toBeTruthy();
    // canary: ig change or invalid cookie
    expect(
      info?.formats?.length ?? 0,
      'no formats — instagram changed or cookie invalid'
    ).toBeGreaterThan(0);

    console.log(
      `[live] instagram OK: "${info?.title}" — ${info?.formats?.length} format(s)`
    );
  }, 60000);
});
