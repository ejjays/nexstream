const facebook = require('../src/services/extractors/facebook');

async function test() {
    // check public video
    const testUrl = 'https://www.facebook.com/watch/?v=10158490333066729'; 
    console.log(`Testing Facebook Extractor with: ${testUrl}`);
    
    try {
        const info = await facebook.getInfo(testUrl);
        console.log('Extracted Info:', JSON.stringify(info, null, 2));
        
        if (info && (info.formats?.length > 0 || info.isPartial)) {
            console.log('✅ Success: Extracted info');
        } else {
            console.log('❌ Failure: Could not extract info');
        }
    } catch (error) {
        console.error('❌ Error during extraction:', error);
    }
}

test();
