import { describe, it, expect } from 'vitest';
import * as instagram from '../src/services/extractors/instagram.js';
import { Readable } from 'node:stream';

describe('Instagram JS Extractor (Pure JS)', () => {
    // Public reel for testing
    const testUrl = 'https://www.instagram.com/reel/DUPkvJDElo6/';

    it('should extract metadata and formats', async () => {
        const info = await instagram.getInfo(testUrl);
        expect(info).not.toBeNull();
        expect(info?.formats?.length).toBeGreaterThan(0);
        console.log(`[Test] Instagram Title: ${info?.title}`);
    }, 20000);

    it('should be able to initiate a stream (Pure JS Stream)', async () => {
        const info = await instagram.getInfo(testUrl);
        if (!info) throw new Error('Info extraction failed');
        
        const formatId = info.formats[0].format_id;
        const stream = await instagram.getStream(info, { formatId });
        
        expect(stream).toBeInstanceOf(Readable);
        
        // Test first chunk
        const reader = stream[Symbol.asyncIterator]();
        const { value, done } = await reader.next();
        
        expect(done).toBe(false);
        expect(value.length).toBeGreaterThan(0);
        console.log(`[Test] Stream connection successful, received ${value.length} bytes`);
        
        // Clean up
        stream.destroy();
    }, 20000);
});
