import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, 'temp/yt-dlp-cache');
const clientArg = 'youtube:player_client=web_safari,android_vr,tv';
const url = 'https://youtu.be/hVvEISFw9w0';

const args = [
  '--ignore-config',
  '--no-playlist',
  '--remote-components',
  'ejs:github',
  '--force-ipv4',
  '--no-check-certificates',
  '--socket-timeout',
  '30',
  '--retries',
  '3',
  '--no-colors',
  '--extractor-args',
  `${clientArg}`,
  '--cache-dir',
  CACHE_DIR,
  '--newline',
  '--progress',
  '--progress-template',
  '[download] %(progress._percent_str)s',
  '--no-part',
  '-o',
  '-',
  url,
];

console.log(`Running: yt-dlp ${args.join(' ')}`);

const ytDlpProcess = spawn('yt-dlp', args);

ytDlpProcess.stdout.on('data', () => {
  /* ignore */
});
ytDlpProcess.stderr.on('data', (d: Buffer) => {
  console.log(`[STDERR] ${d.toString().trim()}`);
});

ytDlpProcess.on('close', (c: number | null) => console.log(`Closed with ${c}`));

// run 10s kill
setTimeout(() => {
  console.log('Killing...');
  ytDlpProcess.kill();
}, 10000);
