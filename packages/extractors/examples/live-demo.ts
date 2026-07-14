import { createXExtractor } from '../dist/index.js';

const url = process.argv[2];
if (!url) {
  console.error('usage: node live-demo.ts <x.com status url>');
  process.exitCode = 1;
} else {
  const x = createXExtractor(); // default env: plain global fetch, no project internals
  const info = await x.getInfo(url);

  if (!info) {
    console.log('No video found (or fetch failed) for', url);
  } else {
    console.log(JSON.stringify(info, null, 2));
  }
}
