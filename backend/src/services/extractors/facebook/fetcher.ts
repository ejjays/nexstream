import { HEADERS, DESKTOP_UA } from './constants.js';
import { secureFetch } from '../../../utils/security.util.js';

type FetchHtmlOptions = {
    cookie?: string;
};

export async function fetchHtml(url: string, options: FetchHtmlOptions): Promise<{ html: string, targetUrl: string, res: Response } | null> {
    const cookie = typeof options.cookie === 'string' ? options.cookie : null;
    const res = await secureFetch(url, {
        headers: { 
            ...HEADERS,
            ...(cookie && { 'Cookie': cookie })
        },
        signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;
    const targetUrl = res.url;
    const html = await res.text();
    return { html, targetUrl, res };
}

export async function fetchFileSize(url: string): Promise<number | undefined> {
    try {
        const hRes = await secureFetch(url, { 
            method: 'HEAD', 
            headers: { 'User-Agent': DESKTOP_UA },
            signal: AbortSignal.timeout(5000) 
        });
        if (hRes.ok) {
            const len = hRes.headers.get('content-length');
            if (len) return parseInt(len, 10);
        }
    } catch (e: unknown) { 
        if (e instanceof Error) {
            console.debug('[FacebookExtractor] Size fetch error:', e.message);
        } else {
            console.debug('[FacebookExtractor] Size fetch error:', String(e));
        }
    }
    return undefined;
}
