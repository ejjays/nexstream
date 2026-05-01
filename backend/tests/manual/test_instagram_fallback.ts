import { getVideoInfo } from '../../src/services/ytdlp/info.js';
import { VideoInfo } from '../../src/types/index.js';

async function test(): Promise<void> {
    const urls = [
        'https://www.instagram.com/reel/DFQe23tOWKz/',
        'https://www.instagram.com/p/DFx6KVduFWy/'
    ];

    for (const url of urls) {
        console.log(`\n[Test] Testing Instagram Fallback: ${url}`);
        const start = Date.now();
        try {
            const info = await getVideoInfo(url, []) as VideoInfo;
            const end = Date.now();
            console.log(`[Success] Time: ${end - start}ms`);
            console.log(`Title: ${info.title}`);
            console.log(`Uploader: ${info.uploader}`);
            console.log(`Formats: ${info.formats?.length || 0}`);
            if (info.formats && info.formats[0]) {
                const type = info.formats[0].is_video ? 'VIDEO' : 'IMAGE';
                console.log(`Type: ${type}`);
                console.log(`Sample URL: ${info.formats[0].url.substring(0, 50)}...`);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('❌ Test failed:', message);
        }
    }
}

test();
