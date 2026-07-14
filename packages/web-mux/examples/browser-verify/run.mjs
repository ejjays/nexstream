// spins up vite, loads the page in headless chromium, and reads back the
// mux results computed by demo.ts — a real WebCodecs/OPFS/Worker run, not a mock.
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ configFile: new URL('./vite.config.ts', import.meta.url).pathname, root: new URL('.', import.meta.url).pathname });
await server.listen();
const url = `http://localhost:5183/`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => console.log('[browser]', msg.text()));
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

await page.goto(url);
await page.waitForFunction(() => window.__muxResults !== undefined, { timeout: 120000 });
const results = await page.evaluate(() => window.__muxResults);

console.log(JSON.stringify(results, null, 2));

await browser.close();
await server.close();

const failed = results.some((r) => !r.ok || !r.hasVideo || !r.hasAudio || !(r.duration > 0));
process.exit(failed ? 1 : 0);
