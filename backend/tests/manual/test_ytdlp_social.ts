import { getVideoInfo } from '../../src/services/ytdlp/info.js';
import { VideoInfo } from '../../src/types/index.js';

async function test(): Promise<void> {
    // check hd reel
    const testUrl = 'https://www.facebook.com/share/r/1AgpHnMxCf/';
    console.log(`Testing YT-DLP Priority Fallback for: ${testUrl}`);
    
    try {
        // test no cookies
        console.log('\n--- 1. Testing without cookies (should use JS) ---');
        const infoJS = await getVideoInfo(testUrl, []) as VideoInfo;
        console.log(`Title: ${infoJS.title}`);
        console.log(`Formats found: ${infoJS.formats?.length || 0}`);
        infoJS.formats?.forEach(f => console.log(` - [${f.format_id}] ${f.resolution}`));

        // check cookie priority
        console.log('\n--- 2. Testing with (simulated) cookies ---');
        const infoYtdlp = await getVideoInfo(testUrl, ['--no-warnings']) as VideoInfo; 
        console.log(`Title: ${infoYtdlp.title}`);
        console.log(`Formats found: ${infoYtdlp.formats?.length || 0}`);
        
        const formats = infoYtdlp.formats || [];
        const uniqueRes = [...new Set(formats.map(f => f.resolution || f.format_note))].filter(Boolean);
        console.log(`Resolutions available: ${uniqueRes.join(', ')}`);

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('❌ Test failed:', message);
    }
}

test();
