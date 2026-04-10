const { getVideoInfo } = require('../src/services/ytdlp/info');
const { prepareFinalResponse } = require('../src/utils/response.util');

async function debugMess(url) {
  console.log(`\n[XB-DEBUG] Testing Facebook URL: ${url}`);
  try {
    const info = await getVideoInfo(url, []);
    console.log('\n--- RAW EXTRACTOR OUTPUT ---');
    console.log(JSON.stringify(info, (key, value) => key === 'original_info' ? '[TRUNCATED]' : value, 2));

    const final = await prepareFinalResponse(info, false, null, url);
    console.log('\n--- FINAL PROCESSED RESPONSE (Picker Data) ---');
    console.log(JSON.stringify(final, null, 2));

  } catch (err) {
    console.error('[XB-DEBUG] Error:', err.message);
  }
}

const targetUrl = 'https://www.facebook.com/share/r/18ZWwGB3bk/';
debugMess(targetUrl);
