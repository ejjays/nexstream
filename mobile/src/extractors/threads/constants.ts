import { DESKTOP_UA } from '../../lib/userAgents';

export { DESKTOP_UA };

// cdn authorizes media against this origin
export const STREAM_REFERER = 'https://www.threads.com/';

export const HEADERS = {
  'User-Agent': DESKTOP_UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

// post|t shortcode from permalink
export const ID_REGEX = /\/(?:post|t)\/([A-Za-z0-9_-]+)/u;
