import * as facebook from '../../src/services/extractors/facebook/index.js';
import { downloadCookies } from '../../src/utils/cookie.util.js';
import { normalizeTitle, normalizeArtist } from '../../src/services/social.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
    const testUrl = 'https://www.facebook.com/share/r/1ACNkisnDk/';
    console.log(`[Test] Running Facebook Extractor for: ${testUrl}`);

    try {
        // Sync cookies first
        const cookiesPath = await downloadCookies('facebook');
        let cookieString = '';
        
        if (cookiesPath && fs.existsSync(cookiesPath)) {
            const content = fs.readFileSync(cookiesPath, 'utf8');
            const lines = content.split('\n');
            const pairs: string[] = [];
            for (const line of lines) {
                if (!line.trim() || line.startsWith('#')) continue;
                const parts = line.split('\t');
                if (parts.length >= 7) pairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
            }
            cookieString = pairs.join('; ');
            console.log(`[Test] Loaded cookies from: ${cookiesPath}`);
        } else {
            console.log('[Test] No cookies found, running without session.');
        }

        const info = await facebook.getInfo(testUrl, { 
            cookie: cookieString,
            cookie_name: 'Cristel Jm Verga' // ignore user name
        });

        if (info) {
            console.log('\n--- EXTRACTED METADATA (RAW) ---');
            console.log(`ID: ${info.id}`);
            console.log(`Raw Title: ${JSON.stringify(info.title)}`);
            console.log(`Raw Author: ${info.author}`);
            
            const finalTitle = normalizeTitle(info);
            const finalAuthor = normalizeArtist(info);
            
            console.log('\n--- FINAL NORMALIZED METADATA ---');
            console.log(`Normalized Title: ${finalTitle}`);
            console.log(`Normalized Author: ${finalAuthor}`);
            console.log(`Formats: ${info.formats?.length || 0}`);
            console.log('--------------------------\n');
        } else {
            console.log('❌ Failure: Extractor returned null');
        }
    } catch (err) {
        console.error('❌ Error during extraction:', err);
    }
}

runTest();
