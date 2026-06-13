import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { http, HttpResponse } from 'msw';
import { getInfo, getStream } from '../../src/services/extractors/bluesky.js';
import { server } from '../setup.js';

vi.mock('../../src/utils/network/proxy.util.js', () => ({
  getQuantumStream: vi.fn(() => new PassThrough()),
}));
import { getQuantumStream } from '../../src/utils/network/proxy.util.js';

const POST_URL = 'https://bsky.app/profile/test.bsky.social/post/3mtest';

const thread = {
  thread: {
    post: {
      record: {
        text: 'hello bsky',
        embed: {
          video: { ref: { $link: 'bafytest' }, size: 5000000 },
          aspectRatio: { width: 720, height: 1280 },
        },
      },
      embed: { thumbnail: 'https://video.bsky.app/thumb.jpg' },
      author: { displayName: 'Test Author', handle: 'test.bsky.social' },
    },
  },
};

describe('Bluesky extractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.use(
      http.get(
        'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle',
        () => HttpResponse.json({ did: 'did:plc:test123' })
      ),
      http.get(
        'https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread',
        () => HttpResponse.json(thread)
      ),
      http.get('https://plc.directory/:did', () =>
        HttpResponse.json({
          service: [
            {
              type: 'AtprotoPersonalDataServer',
              serviceEndpoint: 'https://pds.example',
            },
          ],
        })
      )
    );
  });

  it('resolves the original mp4 blob with metadata', async () => {
    const info = await getInfo(POST_URL);
    expect(info).not.toBeNull();
    if (!info) return;
    const format = info.formats[0];
    expect(format.formatId).toBe('720p');
    expect(format.resolution).toBe('720x1280');
    expect(format.filesize).toBe(5000000);
    expect(format.isMuxed).toBe(true);
    expect(format.url).toBe(
      'https://pds.example/xrpc/com.atproto.sync.getBlob?did=did:plc:test123&cid=bafytest'
    );
    expect(info.title).toBe('hello bsky');
    expect(info.uploader).toBe('Test Author');
  });

  it('getStream streams the blob url', async () => {
    const info = await getInfo(POST_URL);
    expect(info).not.toBeNull();
    if (!info) return;
    const stream = await getStream(info, { formatId: '720p' });
    expect(getQuantumStream).toHaveBeenCalledWith(
      'https://pds.example/xrpc/com.atproto.sync.getBlob?did=did:plc:test123&cid=bafytest',
      expect.anything()
    );
    stream.destroy();
  });

  it('returns null for a non-post URL', async () => {
    expect(
      await getInfo('https://bsky.app/profile/test.bsky.social')
    ).toBeNull();
  });
});
