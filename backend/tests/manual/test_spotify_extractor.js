import { getSpotifyMetadata } from '../src/services/spotify/metadata.js';
import { getInfo } from '../src/services/extractors/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function test() {
  const url =
    'https://open.spotify.com/track/5NCfhUDVq0ZOqseTljkVVz?si=Yaohm9v4T9GRqh018U68YA';

  try {
    console.log('Step 1: Get Metadata');
    const meta = await getSpotifyMetadata(url);
    console.log('Meta:', JSON.stringify(meta, null, 2));

    console.log('\nStep 2: Get YT Info');
    const info = await getInfo(url);
    console.log('Info:', JSON.stringify(info, null, 2));
  } catch (e) {
    console.error('Failed:', e);
  }
}

test();
