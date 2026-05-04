import * as instagram from '../../src/services/extractors/instagram.js';
import { VideoInfo } from '../../src/types/index.js';

async function test() {
    // check public post
    const testUrl = 'https://www.instagram.com/p/DFx6KVduFWy/'; 
    console.log(`Testing Instagram Extractor with: ${testUrl}`);
    
    try {
        const info = await instagram.getInfo(testUrl) as VideoInfo;
        console.log('Extracted Info:', JSON.stringify(info, null, 2));
        
        if (info && info.id) {
            console.log('✅ Success: Extracted basic metadata');
        } else {
            console.log('❌ Failure: Could not extract metadata');
        }
    } catch (err: unknown) {
        const error = err as Error;
        console.error('❌ Error during extraction:', error.message);
    }
}

test();
