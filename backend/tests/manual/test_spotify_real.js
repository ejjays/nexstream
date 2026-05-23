import { getSpotifyMetadata } from '../src/services/spotify/metadata.js';
import 'dotenv/config';

async function test() {
  const url =
    'https://open.spotify.com/track/4cOdzhRmdnyqyKIoQp7uTB?si=176f4142f9a246a4';
  try {
    const meta = await getSpotifyMetadata(url);
    console.log('Meta:', JSON.stringify(meta, null, 2));
  } catch (e) {
    console.error(e);
  }
}

test();
