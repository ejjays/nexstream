const { getInfo } = require('../../src/services/extractors/facebook');
const fs = require('fs');
const path = require('path');

async function testStory(url) {
    console.log(`[Test] testing facebook story: ${url}`);
    
    // load cookies
    let cookie = '';
    const cookiePath = path.join(__dirname, '../../facebook_cookies.txt');
    if (fs.existsSync(cookiePath)) {
        console.log(`[Test] loading cookies from ${cookiePath}`);
        const content = fs.readFileSync(cookiePath, 'utf8');
        // netscape to string
        const lines = content.split('\n');
        const cookiePairs = [];
        for (const line of lines) {
            if (!line.trim() || line.startsWith('#')) continue;
            const parts = line.split('\t');
            if (parts.length >= 7) {
                cookiePairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
            }
        }
        cookie = cookiePairs.join('; ');
    } else {
        console.warn(`[Test] no cookies found at ${cookiePath}`);
    }

    try {
        const info = await getInfo(url, { cookie });
        if (info) {
            console.log('[Test] SUCCESS: Extraction complete');
            console.log(`[Test] Title: ${info.title}`);
            console.log(`[Test] Author: ${info.author}`);
            console.log(`[Test] Formats: ${info.formats.length}`);
            info.formats.forEach(f => {
                console.log(`  - [${f.format_id}] ${f.resolution}: ${f.url.substring(0, 60)}...`);
            });
        } else {
            console.error('[Test] FAILED: Could not extract info');
        }
    } catch (e) {
        console.error(`[Test] ERROR: ${e.message}`);
    }
}

const url = process.argv[2];
if (!url) {
    console.log('Usage: node test_fb_stories.js <FB_STORY_URL>');
    process.exit(1);
}

testStory(url);
