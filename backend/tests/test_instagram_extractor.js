const instagram = require('../src/services/extractors/instagram');

async function test() {
    const testUrl = 'https://www.instagram.com/p/C-i9Y6PypZ2/'; // Popular public post
    console.log(`Testing Instagram Extractor with: ${testUrl}`);
    
    try {
        const info = await instagram.getInfo(testUrl);
        console.log('Extracted Info:', JSON.stringify(info, null, 2));
        
        if (info && info.id) {
            console.log('✅ Success: Extracted basic metadata');
        } else {
            console.log('❌ Failure: Could not extract metadata');
        }
    } catch (error) {
        console.error('❌ Error during extraction:', error);
    }
}

test();
