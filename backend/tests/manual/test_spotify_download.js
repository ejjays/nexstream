import 'dotenv/config';
import { streamDownload } from '../src/services/ytdlp/streamer.js';
import { getVideoInfo } from '../src/services/ytdlp/info.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testActualDownload() {
  const url =
    'https://open.spotify.com/track/5NCfhUDVq0ZOqseTljkVVz?si=Yaohm9v4T9GRqh018U68YA';
  const outputPath = path.join(__dirname, 'test_output.mp3');

  try {
    console.log('Fetching info...');
    const info = await getVideoInfo(url);
    console.log('Target:', info.title);

    console.log('Starting download...');
    await streamDownload(url, 'mp3', outputPath, (status) => {
      console.log(`[Status] ${status.status} - ${status.progress}%`);
    });

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`Success! File size: ${stats.size} bytes`);
    } else {
      console.error('File not created');
    }
  } catch (e) {
    console.error('Download failed:', e);
  }
}

testActualDownload();
