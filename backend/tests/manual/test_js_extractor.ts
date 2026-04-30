import * as youtube from '../../src/services/extractors/youtube.js';
import { VideoInfo } from '../../src/types/index.js';
import { Readable } from 'node:stream';

async function runTest() {
  const url = 'https://www.youtube.com/watch?v=n6qZ-yM5kGE';
  console.log('--- Testing JS Extractor ---');
  
  try {
    console.log('1. Fetching Video Info...');
    const info = await youtube.getInfo(url) as VideoInfo;
    console.log('Success!');
    console.log('Title:', info.title);
    console.log('Formats found:', info.formats.length);
    if (info.formats.length > 0) {
      console.log('First format URL type:', typeof info.formats[0].url);
      console.log('First format URL (first 50 chars):', String(info.formats[0].url).substring(0, 50));
    }
    
    if (info.formats.length === 0) {
      throw new Error('No formats discovered!');
    }

    console.log('\n2. Testing Stream (First 500KB)...');
    const audioItag = info.formats.find(f => f.is_audio)?.itag?.toString() || '140';
    console.log('Using itag:', audioItag);
    
    const stream = await youtube.getStream(info, { 
      formatId: audioItag
    }) as Readable;

    let bytesReceived = 0;
    const limit = 500 * 1024;

    // Type casting to handle different stream types in tests if necessary, 
    // but youtube.getStream returns Readable in TS now.
    
    for await (const chunk of stream) {
      bytesReceived += chunk.length;
      process.stdout.write('.');
      if (bytesReceived >= limit) break;
    }

    console.log(`\nStream Test Success! Received ${Math.round(bytesReceived / 1024)} KB`);
    console.log('\n--- ALL TESTS PASSED ---');
    process.exit(0);

  } catch (err: unknown) {
    const error = err as Error;
    console.error('\n--- TEST FAILED ---');
    console.error(error.message);
    process.exit(1);
  }
}

runTest();
