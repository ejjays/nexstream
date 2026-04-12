const youtube = require('../src/services/extractors/youtube');

async function runTest() {
  const url = 'https://www.youtube.com/watch?v=n6qZ-yM5kGE';
  console.log('--- Testing JS Extractor ---');
  
  try {
    console.log('1. Fetching Video Info...');
    const info = await youtube.getInfo(url);
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
    const audioItag = info.formats.find(f => f.is_audio)?.itag || '140';
    console.log('Using itag:', audioItag);
    
    const stream = await youtube.getStream(info, { 
      formatId: audioItag,
      format: 'mp3',
      type: 'audio'
    });

    let bytesReceived = 0;
    const limit = 500 * 1024;

    if (stream.getReader) {
      const reader = stream.getReader();
      while (bytesReceived < limit) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesReceived += value.length;
        process.stdout.write('.');
      }
    } else if (Symbol.asyncIterator in stream) {
      for await (const chunk of stream) {
        bytesReceived += chunk.length;
        process.stdout.write('.');
        if (bytesReceived >= limit) break;
      }
    } else {
      await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
          bytesReceived += chunk.length;
          process.stdout.write('.');
          if (bytesReceived >= limit) resolve();
        });
        stream.on('error', reject);
        stream.on('end', resolve);
      });
    }

    console.log(`\nStream Test Success! Received ${Math.round(bytesReceived / 1024)} KB`);
    console.log('\n--- ALL TESTS PASSED ---');
    process.exit(0);

  } catch (err) {
    console.error('\n--- TEST FAILED ---');
    console.error(err);
    process.exit(1);
  }
}

runTest();
