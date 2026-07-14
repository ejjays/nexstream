// urls pulled from mobile/tests/live/live-cases.json
import { createXExtractor, createBlueskyExtractor, createVimeoExtractor } from '../dist/index.js';

const CASES = [
  { name: 'x (mrbeast tweet)', make: createXExtractor, url: 'https://x.com/i/status/2030683209466335363' },
  { name: 'bluesky (bsky.app official post)', make: createBlueskyExtractor, url: 'https://bsky.app/profile/bsky.app/post/3mk4lzkrnk22d' },
  { name: 'vimeo (official video)', make: createVimeoExtractor, url: 'https://vimeo.com/76979871' },
];

let failed = false;
for (const c of CASES) {
  const extractor = c.make();
  const start = Date.now();
  try {
    const info = await extractor.getInfo(c.url);
    const ms = Date.now() - start;
    if (!info) {
      console.log(`FAIL  ${c.name} (${ms}ms) — getInfo returned null`);
      failed = true;
      continue;
    }
    console.log(`PASS  ${c.name} (${ms}ms)`);
    console.log(`      title: ${JSON.stringify(info.title)}`);
    console.log(`      uploader: ${JSON.stringify(info.uploader)}`);
    console.log(`      formats: ${info.formats.map((f) => f.quality ?? f.formatId).join(', ')}`);
    console.log(`      first format url reachable: ${info.formats[0]?.url?.startsWith('http')}`);
  } catch (err) {
    console.log(`FAIL  ${c.name} — threw: ${err.message}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
