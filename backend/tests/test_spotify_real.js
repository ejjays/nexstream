require('dotenv').config({ path: './backend/.env' });
const extractor = require('../src/services/extractors/spotify');

async function testSpotifyReal() {
  const url = 'https://open.spotify.com/track/5NCfhUDVq0ZOqseTljkVVz?si=Yaohm9v4T9GRqh018U68YA';
  console.log('--- REAL INTEGRATION TEST ---');
  console.log('Target:', url);
  console.log('Soundcharts ID:', process.env.SOUNDCHARTS_APP_ID ? '✅ LOADED' : '❌ MISSING');
  console.log('Turso URL:', process.env.TURSO_URL ? '✅ LOADED' : '❌ MISSING');
  console.log('Redis URL:', process.env.REDIS_URL ? '✅ LOADED' : '❌ MISSING');
  
  const timeout = setTimeout(() => {
    console.error('\nTest timed out after 45 seconds');
    process.exit(1);
  }, 45000);

  try {
    const info = await extractor.getInfo(url, {
      onProgress: (status, progress, extra) => {
        console.log(`[Progress] ${status}: ${progress}%`, extra?.subStatus || '');
      }
    });

    console.log('\n--- SUCCESS ---');
    console.log('Title:', info.title);
    console.log('Artist:', info.artist);
    console.log('Target YouTube:', info.target_url);
    console.log('From Brain:', info.fromBrain ? '✅ YES' : 'NO (Freshly resolved)');
    console.log('Formats:', info.formats?.length || 0);

    if (info.formats?.length > 0) {
      const audio = info.formats.find(f => f.is_audio);
      console.log('Audio Stream itag:', audio?.itag);
    }

  } catch (error) {
    console.error('\n--- FAILED ---');
    console.error('Error:', error.message);
  } finally {
    clearTimeout(timeout);
    // Give background tasks a second to settle then exit
    setTimeout(() => process.exit(0), 2000);
  }
}

testSpotifyReal();
