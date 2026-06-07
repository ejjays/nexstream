import { describe, it, expect } from 'vitest';
import { facebook } from '../../src/services/extractors/index.js';

// live test, real facebook fetch
// run on residential ip not datacenter
const RUN = process.env.LIVE_TEST === '1';
const ldescribe = RUN ? describe : describe.skip;

// stable public video, override via env
const FB_URL =
  process.env.FB_LIVE_URL || 'https://www.facebook.com/share/v/14g92yF6msh/';

ldescribe('facebook extractor (live)', () => {
  it('resolves a real facebook video to playable formats', async () => {
    const info = await facebook.getInfo(FB_URL, {});

    expect(info, 'extractor returned null — likely broken').toBeTruthy();
    expect(info?.title, 'no title resolved').toBeTruthy();
    // canary for facebook page changes
    expect(
      info?.formats?.length ?? 0,
      'no formats — facebook likely changed, extractor needs a fix'
    ).toBeGreaterThan(0);

    console.log(
      `[live] facebook OK: "${info?.title}" — ${info?.formats?.length} format(s)`
    );
  }, 60000);
});
