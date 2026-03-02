const { getVideoInfo } = require('../src/services/ytdlp/info');
const { proxyStream } = require('../src/controllers/video.controller');
const express = require('express');

const log = (m) => console.log(`[TEST] ${m}`);

async function run() {
  log('fetching info for test url...');
  
  try {
    const url = 'https://youtu.be/hVvEISFw9w0';
    const info = await getVideoInfo(url);
    const target = info.formats.find(f => f.vcodec !== 'none')?.url;

    if (!target) throw new Error('no streamable format found');

    const app = express();
    app.get('/proxy', proxyStream);

    const server = app.listen(0, async () => {
      const { port } = server.address();
      const testUrl = `http://127.0.0.1:${port}/proxy?url=${encodeURIComponent(target)}`;

      log(`testing proxy on port ${port}...`);

      const res = await fetch(testUrl, { headers: { range: 'bytes=0-100' } });
      
      console.log(`\nStatus: ${res.status}`);
      for (let [k, v] of res.headers) console.log(`${k}: ${v}`);

      const bytes = (await res.arrayBuffer()).byteLength;
      log(`received ${bytes} bytes`);

      if (res.status === 206 && bytes > 0) {
        log('proxy check passed.');
      } else {
        log('proxy check failed.');
      }

      server.close();
    });
  } catch (e) {
    console.error(`fail: ${e.message}`);
    process.exit(1);
  }
}

run();
