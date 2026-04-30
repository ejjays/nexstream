import { getInfo } from '../../src/services/extractors/facebook.js';
import { VideoInfo, ExtractorOptions } from '../../src/types/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testStory(url: string): Promise<void> {
    console.log(`[Test] testing facebook story: ${url}`);
    
    // load cookies
    let cookie = '';
    const cookiePath = path.join(__dirname, '../../facebook_cookies.txt');
    if (fs.existsSync(cookiePath)) {
        console.log(`[Test] loading cookies from ${cookiePath}`);
        const content = fs.readFileSync(cookiePath, 'utf8');
        // netscape to string
        const lines = content.split('\n');
        const cookiePairs: string[] = [];
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
        const options: ExtractorOptions = { cookie_name: cookie };
        const info = await getInfo(url, options) as VideoInfo;
        if (info) {
            console.log('[Test] SUCCESS: Extraction complete');
            console.log(`[Test] Title: ${info.title}`);
            console.log(`[Test] Author: ${info.uploader}`);
            console.log(`[Test] Formats: ${info.formats?.length || 0}`);
            info.formats?.forEach(f => {
                console.log(`  - [${f.format_id}] ${f.resolution}: ${f.url.substring(0, 60)}...`);
            });
        } else {
            console.error('[Test] FAILED: Could not extract info');
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Test] ERROR: ${message}`);
    }
}

const url = process.argv[2];
if (!url) {
    console.log('Usage: node test_fb_stories.js <FB_STORY_URL>');
    process.exit(1);
}

testStory(url);
