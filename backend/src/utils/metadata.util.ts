import metascraper from 'metascraper';
import metascraperAuthor from 'metascraper-author';
import metascraperDescription from 'metascraper-description';
import metascraperImage from 'metascraper-image';
import metascraperLogo from 'metascraper-logo';
import metascraperPublisher from 'metascraper-publisher';
import metascraperTitle from 'metascraper-title';
import metascraperUrl from 'metascraper-url';
import metascraperYoutube from 'metascraper-youtube';
import metascraperSpotify from 'metascraper-spotify';
import metascraperInstagram from 'metascraper-instagram';
import metascraperTiktok from 'metascraper-tiktok';
import metascraperSoundcloud from 'metascraper-soundcloud';
import got, { Got } from 'got';

const scraper = metascraper([
  metascraperAuthor(),
  metascraperDescription(),
  metascraperImage(),
  metascraperLogo(),
  metascraperPublisher(),
  metascraperTitle(),
  metascraperUrl(),
  metascraperYoutube(),
  metascraperSpotify(),
  metascraperInstagram(),
  metascraperTiktok(),
  metascraperSoundcloud()
]);

export interface Metadata {
  author: string | null;
  description: string | null;
  image: string | null;
  logo: string | null;
  publisher: string | null;
  title: string | null;
  url: string | null;
}

// fetch metadata
export async function fetchMetadata(targetUrl: string): Promise<Metadata | null> {
  try {
    // rewrite mobile URL
    let fetchUrl = targetUrl;
    if (targetUrl.includes('facebook.com') && !targetUrl.includes('m.facebook.com')) {
      fetchUrl = targetUrl.replace('www.facebook.com', 'm.facebook.com');
    }
    if (targetUrl.includes('instagram.com') && !targetUrl.includes('m.instagram.com')) {
      fetchUrl = targetUrl.replace('www.instagram.com', 'm.instagram.com');
    }

    // set sneaky headers
    const response = await (got as unknown as Got)(fetchUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.5',
        'upgrade-insecure-requests': '1',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
      },
      timeout: 10000,
      retry: 2,
      followRedirect: true
    });

    const html = response.body;
    const url = response.url; // use final URL

    const metadata = await scraper({ html, url });
    return metadata as Metadata;
  } catch (error) {
    // debug stealth fail
    console.debug(`[MetadataUtil] Stealth fetch failed for ${targetUrl}:`, error instanceof Error ? error.message : error);
    return null;
  }
}
