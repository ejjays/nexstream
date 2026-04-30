import axios from 'axios';

async function debugDetailed(url: string): Promise<void> {
  console.log(`[Debug] Deep Scrape: ${url}`);
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const html: string = response.data;
    
    // Look for OG Title
    const ogTitleMatch = html.match(/meta property="og:title" content="([^"]+)"/) || html.match(/meta name="twitter:title" content="([^"]+)"/);
    console.log('OG Title:', ogTitleMatch ? ogTitleMatch[1] : 'NOT FOUND');

    // Look for Description (often contains the real title/caption)
    const descriptionMatch = html.match(/meta property="og:description" content="([^"]+)"/) || html.match(/meta name="description" content="([^"]+)"/);
    console.log('Description:', descriptionMatch ? descriptionMatch[1].substring(0, 100) + '...' : 'NOT FOUND');

    // Look for JSON-LD or Script data
    const scriptData = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/);
    if (scriptData) {
        try {
            const parsed = JSON.parse(scriptData[1]);
            console.log('JSON-LD Found:', JSON.stringify(parsed, null, 2));
        } catch (e) {
            console.log('JSON-LD Parse Failed');
        }
    }

    // Look for Video URLs again
    const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/);
    const hdUrl = hdMatch ? hdMatch[1].replace(/\\/g, '') : null;
    
    if (hdUrl) {
        console.log('Found HD URL, fetching size...');
        try {
            const head = await axios.head(hdUrl, { timeout: 5000 });
            console.log('File Size (Bytes):', head.headers['content-length']);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.log('Size fetch failed:', message);
        }
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Scrape failed:', message);
  }
}

const targetUrl = 'https://www.facebook.com/share/v/1DZwYZ6QTY/';
debugDetailed(targetUrl);
