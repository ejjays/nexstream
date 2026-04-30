import { getVideoInfo } from '../../src/services/ytdlp/info.js';
import { proxyStream } from '../../src/controllers/video.controller.js';
import express, { Request, Response } from 'express';
import { VideoInfo } from '../../src/types/index.js';
import { AddressInfo } from 'net';

const log = (m: string) => console.log(`[TEST] ${m}`);

async function run(): Promise<void> {
  log('fetching info for test url...');
  
  try {
    const url = 'https://youtu.be/hVvEISFw9w0';
    const info = await getVideoInfo(url) as VideoInfo;
    const target = info.formats?.find(f => f.vcodec !== 'none')?.url;

    if (!target) throw new Error('no streamable format found');

    const app = express();
    app.get('/proxy', (req: Request, res: Response) => {
        // Mocking behavior if proxyStream is designed for a specific route
        return proxyStream(req, res);
    });

    const server = app.listen(0, async () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`fail: ${message}`);
    process.exit(1);
  }
}

run();
