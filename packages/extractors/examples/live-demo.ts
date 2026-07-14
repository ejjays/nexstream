import { createXExtractor } from '../dist/index.js';

const url = process.argv[2];
if (!url) {
  console.error('usage: node live-demo.ts <x.com status url>');
  process.exit(1);
}

const x = createXExtractor(); // default env: plain global fetch, no project internals
const info = await x.getInfo(url);

if (!info) {
  console.log('No video found (or fetch failed) for', url);
  process.exit(0);
}

console.log(JSON.stringify(info, null, 2));
