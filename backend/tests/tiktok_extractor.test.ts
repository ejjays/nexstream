import { describe, it, expect } from 'vitest';
import * as tiktok from '../src/services/extractors/tiktok.js';

/**
 * TikTok JS Extractor Test
 * Architectural Note: This extractor is intended for FAST metadata resolution.
 * Actual file streaming/download is handled by yt-dlp to avoid 403 Forbidden errors
 * often encountered in pure JS headless environments.
 */
describe('TikTok JS Extractor (Pure JS)', () => {
    // We use a live URL to ensure our scraper works against actual TikTok DOM
    const testUrl = 'https://vt.tiktok.com/ZS9PxUwTM/';

    it('should extract valid metadata including title and author', async () => {
        const info = await tiktok.getInfo(testUrl);
        
        expect(info).not.toBeNull();
        if (info) {
            expect(info.title).toBeDefined();
            expect(info.title.length).toBeGreaterThan(5);
            expect(info.uploader).toBeDefined();
            expect(info.extractor_key).toBe('tiktok');
            console.log(`[Test] Extracted Title: ${info.title}`);
        }
    }, 20000);

    it('should discover at least one video format URL', async () => {
        const info = await tiktok.getInfo(testUrl);
        
        expect(info?.formats).toBeDefined();
        expect(info?.formats?.length).toBeGreaterThan(0);
        
        const firstFormat = info?.formats?.[0];
        expect(firstFormat?.url).toContain('http');
        console.log(`[Test] Discovered URL: ${firstFormat?.url.substring(0, 50)}...`);
    }, 20000);

    it('should correctly expand short URLs to full tiktok.com URLs', async () => {
        const info = await tiktok.getInfo(testUrl);
        expect(info?.webpage_url).toContain('tiktok.com/@');
        expect(info?.webpage_url).toContain('/video/');
        console.log(`[Test] Expanded URL: ${info?.webpage_url}`);
    }, 20000);
});
