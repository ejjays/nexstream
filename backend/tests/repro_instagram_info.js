const { getInfo } = require('../src/services/extractors/instagram');

async function testInstagram(url) {
  console.log(`\n[Test] Testing Instagram: ${url}`);
  const start = Date.now();
  try {
    const info = await getInfo(url);
    const end = Date.now();
    
    if (info) {
      console.log(`[Success] Time: ${end - start}ms`);
      console.log('Title:', info.title);
      console.log('Author:', info.uploader);
      console.log('Thumbnail:', info.thumbnail ? 'YES' : 'MISSING');
      console.log('Formats:', info.formats.length);
      if (info.formats[0]) {
          console.log('Video URL found:', info.formats[0].url.substring(0, 50) + '...');
      }
    } else {
      console.log('[Failed] No info returned (Might need yt-dlp fallback)');
    }
  } catch (err) {
    console.error('[Error]:', err.message);
  }
}

async function run() {
    // A known public reel
    await testInstagram('https://www.instagram.com/reel/DFQe23tOWKz/');
    // A known public post
    await testInstagram('https://www.instagram.com/p/DFx6KVduFWy/');
}

run();
