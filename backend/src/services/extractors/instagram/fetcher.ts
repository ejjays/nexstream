import { z } from 'zod';

export const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
export const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
export const HEADERS = {
    'User-Agent': DESKTOP_UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

const OEmbedResponseSchema = z.object({
    title: z.string().optional(),
    author_name: z.string().optional(),
    thumbnail_url: z.string().optional(),
}).catchall(z.unknown());

const GraphqlResponseSchema = z.object({
    data: z.object({
        xdt_shortcode_media: z.object({
            video_url: z.string().optional(),
            thumbnail_src: z.string().optional(),
            owner: z.object({
                username: z.string().optional()
            }).optional(),
            edge_media_to_caption: z.object({
                edges: z.array(z.object({
                    node: z.object({
                        text: z.string().optional()
                    }).optional()
                })).optional()
            }).optional()
        }).catchall(z.unknown()).optional()
    }).catchall(z.unknown()).optional()
}).catchall(z.unknown());

export async function fetchOembed(shortcode: string, fetchHeaders: Record<string, string>): Promise<any> {
    const oembedUrl = `https://api.instagram.com/oembed/?url=https://www.instagram.com/reel/${shortcode}/`;
    const res = await fetch(oembedUrl, { headers: fetchHeaders });
    if (res.ok) {
        const raw = await res.json();
        const parsed = OEmbedResponseSchema.safeParse(raw);
        if (parsed.success) return parsed.data;
        console.debug('[InstagramFetcher] OEmbed schema validation failed:', parsed.error.message);
    }
    return null;
}

export async function fetchGraphql(shortcode: string, fetchHeaders: Record<string, string>): Promise<any> {
    const variables = JSON.stringify({ shortcode: shortcode, child_comment_count: 3, fetch_comment_count: 40, parent_comment_count: 24, has_threaded_comments: true });
    const gqlUrl = `https://www.instagram.com/graphql/query/?doc_id=8845758582119845&variables=${encodeURIComponent(variables)}`;
    const res = await fetch(gqlUrl, { headers: fetchHeaders, signal: AbortSignal.timeout(10000) });
    if (res.ok) {
        const raw = await res.json();
        const parsed = GraphqlResponseSchema.safeParse(raw);
        if (parsed.success) return parsed.data;
        console.debug('[InstagramFetcher] GraphQL schema validation failed:', parsed.error.message);
    }
    return null;
}

export async function fetchEmbed(shortcode: string, fetchHeaders: Record<string, string>): Promise<string | null> {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const res = await fetch(embedUrl, {
        headers: fetchHeaders,
        signal: AbortSignal.timeout(10000)
    });
    
    if (res.ok) {
        return await res.text();
    } else {
        console.warn(`[JS-IG] Embed page fetch failed with status: ${res.status}`);
    }
    return null;
}

export async function fetchFileSize(url: string): Promise<number | undefined> {
    try {
        const hRes = await fetch(url, { 
            method: 'HEAD', 
            headers: { 'User-Agent': MOBILE_UA },
            signal: AbortSignal.timeout(2000) 
        });
        const len = hRes.headers.get('content-length');
        if (len) return parseInt(len, 10);
    } catch (e: any) { 
        console.debug('[InstagramExtractor] Size fetch error:', e.message); 
    }
    return undefined;
}
