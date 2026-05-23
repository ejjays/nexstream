require('dotenv').config({ path: './backend/.env' });
const { streamDownload } = require('../src/services/ytdlp/streamer');
const { getVideoInfo } = require('../src/services/ytdlp/info');
const fs = require('fs');
const path = require('path');

async function testActualDownload() {
  const url = 'https://open.spotify.com/track/5NCfhUDVq0ZOqseTljkVVz?si=Yaohm9v4T9GRqh018U68YA';
  const outputPath = path.join(__dirname, 'test_output.mp3');
  
  console.log('--- STARTING ACTUAL PUREJS DOWNLOAD TEST ---');
  console.log('Target:', url);

  try {
    // 1. fetch info
    console.log('[1/3] Fetching Info...');
    const info = await getVideoInfo(url);
    console.log(`[Info] Title: ${info.title} | Extractor: ${info.extractorKey}`);

    // 2. start stream
    console.log('[2/3] Opening PureJS Stream (MP3 Transcode)...');
    const stream = streamDownload(url, { format: 'mp3', formatId: 'mp3' }, [], info);

    const fileStream = fs.createWriteStream(outputPath);
    stream.pipe(fileStream);

    let bytesDownloaded = 0;
    stream.on('data', (chunk) => {
      bytesDownloaded += chunk.length;
      if (bytesDownloaded % (1024 * 1024) < 1024 * 50) { // log 1MB
          console.log(`[Progress] Downloaded: ${(bytesDownloaded / 1024 / 1024).toFixed(2)} MB`);
      }
    });

    stream.on('progress', () => {
        // log progress
    });

    // 3. wait completion
    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      stream.on('error', reject);
      
      // safety timeout
      setTimeout(() => reject(new Error('Download timed out after 60s')), 60000);
    });

    const stats = fs.statSync(outputPath);
    console.log('\n--- DOWNLOAD SUCCESS ---');
    console.log('File Saved:', outputPath);
    console.log('Final Size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
    
    if (stats.size > 1024 * 1024) {
      console.log('VERIFIED: File size is realistic for a high-quality MP3.');
    } else {
      console.log('WARNING: File size seems too small.');
    }

  } catch (error) {
    console.error('\n--- DOWNLOAD FAILED ---');
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testActualDownload();
