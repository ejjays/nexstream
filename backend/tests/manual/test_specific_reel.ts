import { getInfo } from '../../src/services/extractors/facebook/extractor.ts';
import { normalizeTitle } from '../../src/services/social.service.ts';

async function test() {
    const url = 'https://www.facebook.com/share/v/1BAcYsuva6/';
    console.log(`Testing URL: ${url}`);
    
    const info = await getInfo(url);
    if (!info) {
        console.error('Failed to extract info');
        return;
    }
    
    const finalTitle = normalizeTitle(info);
    
    console.log('\n--- Extraction Result ---');
    console.log(`Raw Title:   ${info.title}`);
    console.log(`Uploader:    ${info.uploader}`);
    console.log(`Final Title: ${finalTitle}`);
    console.log('-------------------------\n');
}

test().catch(console.error);
