import * as Constants from './constants.js';

export async function fetchHtml(url: string, options: any): Promise<{ html: string, targetUrl: string, res: Response } | null> {
    const cookie = typeof options.cookie === 'string' ? options.cookie : null;
    const res = await fetch(url, {
        headers: { 
            ...Constants.HEADERS,
            ...(cookie && { 'Cookie': cookie })
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;
    const targetUrl = res.url;
    const html = await res.text();
    return { html, targetUrl, res };
}

export async function fetchFileSize(url: string): Promise<number | undefined> {
    try {
        const hRes = await fetch(url, { 
            method: 'HEAD', 
            headers: { 'User-Agent': Constants.DESKTOP_UA },
            signal: AbortSignal.timeout(5000) 
        });
        if (hRes.ok) {
            const len = hRes.headers.get('content-length');
            if (len) return parseInt(len, 10);
        }
    } catch (e: any) { 
        console.debug('[FacebookExtractor] Size fetch error:', e.message); 
    }
    return undefined;
}
