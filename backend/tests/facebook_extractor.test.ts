import { describe, it, expect } from 'vitest';
import * as facebook from '../src/services/extractors/facebook/index.js';
import { Readable } from 'node:stream';

describe('Facebook JS Extractor (Pure JS)', () => {
    // Public F1 Reel for testing
    const testUrl = 'https://www.facebook.com/share/r/1KJUSQ3JkR/';

    it('should extract metadata and formats', async () => {
        const info = await facebook.getInfo(testUrl);
        expect(info).not.toBeNull();
        expect(info?.formats?.length).toBeGreaterThan(0);
        console.log(`[Test] Facebook Title: ${info?.title}`);
        console.log(`[Test] Formats found: ${info?.formats?.length}`);
    }, 20000);

    it('should be able to initiate a stream (Pure JS Stream)', async () => {
        const info = await facebook.getInfo(testUrl);
        if (!info) throw new Error('Info extraction failed');
        
        const formatId = info.formats[0].format_id;
        const stream = await facebook.getStream(info, { formatId });
        
        expect(stream).toBeInstanceOf(Readable);
        
        // Test first chunk
        const reader = stream[Symbol.asyncIterator]();
        const { value, done } = await reader.next();
        
        expect(done).toBe(false);
        expect(value.length).toBeGreaterThan(0);
        console.log(`[Test] Facebook Stream connection successful, received ${value.length} bytes`);
        
        // Clean up
        stream.destroy();
    }, 25000);
});
