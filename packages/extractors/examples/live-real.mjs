// urls pulled from mobile/tests/live/live-cases.json — routed through resolve()
// (host-matching dispatcher) instead of manually picking an extractor per URL
import { resolve } from '../dist/index.js';

const CASES = [
  { name: 'x (mrbeast tweet)', url: 'https://x.com/i/status/2030683209466335363' },
  { name: 'bluesky (bsky.app official post)', url: 'https://bsky.app/profile/bsky.app/post/3mk4lzkrnk22d' },
  { name: 'vimeo (official video)', url: 'https://vimeo.com/76979871' },
];

let failed = false;
for (const c of CASES) {
  const start = Date.now();
  try {
    const info = await resolve(c.url);
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

process.exitCode = failed ? 1 : 0;
