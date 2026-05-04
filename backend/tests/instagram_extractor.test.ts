import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as instagram from '../src/services/extractors/instagram.js';
import { Readable } from 'node:stream';

describe('Instagram JS Extractor (Pure JS)', () => {
    const testUrl = 'https://www.instagram.com/reel/DFQe23tOWKz/';
    const mockHtml = `
        <html>
            <body>
                <script>
                    window.__additionalDataLoaded('feed', {
                        "shortcode_media": {
                            "video_url": "https://scontent.cdninstagram.com/v/test.mp4?_nc_ht=video.fmnl",
                            "display_url": "https://scontent.cdninstagram.com/v/test.jpg",
                            "owner": { "username": "test_user" },
                            "edge_media_to_caption": { "edges": [{ "node": { "text": "Test Title #awesome" } }] }
                        }
                    });
                </script>
            </body>
        </html>
    `;

    beforeEach(() => {
        vi.restoreAllMocks();
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('api.instagram.com/oembed')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        title: 'OEmbed Title',
                        author_name: 'OEmbed Author',
                        thumbnail_url: 'https://thumb.jpg'
                    })
                } as any);
            }
            if (url.includes('graphql/query')) {
                return Promise.resolve({ ok: false } as any);
            }
            return Promise.resolve({
                ok: true,
                text: () => Promise.resolve(mockHtml),
                headers: { get: (name: string) => name === 'content-length' ? '123456' : null },
                status: 200,
                url: testUrl
            } as any);
        });
    });

    it('should extract metadata and formats', async () => {
        const info = await instagram.getInfo(testUrl);
        expect(info).not.toBeNull();
        expect(info?.formats?.length).toBeGreaterThan(0);
        expect(info?.uploader).toMatch(/test_user|OEmbed Author/);
        expect(info?.formats[0].url).toContain('test.mp4');
        // validate title
        expect(info?.title).toMatch(/Title/);
    }, 20000);

    it('should be able to initiate a stream (Pure JS Stream)', async () => {
        const info = await instagram.getInfo(testUrl);
        expect(info).not.toBeNull();
        if (!info) return;
        
        const formatId = info.formats[0].format_id;
        const stream = await instagram.getStream(info, { formatId });
        
        expect(stream).toBeInstanceOf(Readable);
        stream.destroy();
    }, 20000);
});
