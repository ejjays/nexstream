import { secureFetch } from '../../../utils/network/security.util.js';

export async function fetchJson(
  url: string,
  options: { cookie?: string } = {}
): Promise<unknown> {
  const cookie = typeof options.cookie === 'string' ? options.cookie : null;
  const response = await secureFetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.5',
      'X-Requested-With': 'XMLHttpRequest',
      ...(cookie && { Cookie: cookie }),
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;
  return await response.json();
}

export async function fetchEmbed(
  url: string,
  options: { cookie?: string } = {}
): Promise<string | null> {
  const cookie = typeof options.cookie === 'string' ? options.cookie : null;
  const response = await secureFetch(`${url}embed/captioned/`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...(cookie && { Cookie: cookie }),
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;
  return await response.text();
}

export async function fetchFileSize(url: string): Promise<number | undefined> {
  try {
    const headResponse = await secureFetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (headResponse.ok) {
      const contentLengthHeader = headResponse.headers.get('content-length');
      if (contentLengthHeader) return parseInt(contentLengthHeader, 10);
    }
  } catch (error: unknown) {
    const errorObj = error as Error;
    console.debug(`[Instagram] Size fetch failed: ${errorObj.message}`);
  }
  return undefined;
}
