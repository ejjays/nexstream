import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/net', () => ({
  gatedFetch: vi.fn(),
}));

import { gatedFetch } from '../src/lib/net';
import { getInfo } from '../src/extractors/bluesky';

const mockFetch = vi.mocked(gatedFetch);

function jsonRes(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('bluesky getInfo', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('builds a direct blob mp4 format from a video post', async () => {
    const did = 'did:plc:abc123';
    const cid = 'bafyvideocid';
    mockFetch
      .mockResolvedValueOnce(jsonRes({ did }))
      .mockResolvedValueOnce(
        jsonRes({
          thread: {
            post: {
              record: {
                text: 'check this clip',
                embed: {
                  video: { ref: { $link: cid }, size: 1234567 },
                  aspectRatio: { width: 1080, height: 1920 },
                },
              },
              embed: { thumbnail: 'https://cdn.bsky/thumb.jpg' },
              author: { displayName: 'Alice', handle: 'alice.bsky.social' },
            },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonRes({
          service: [
            {
              type: 'AtprotoPersonalDataServer',
              serviceEndpoint: 'https://pds.example.com',
            },
          ],
        })
      );

    const info = await getInfo(
      'https://bsky.app/profile/alice.bsky.social/post/3kabc'
    );

    expect(info).not.toBeNull();
    expect(info?.extractorKey).toBe('bluesky');
    expect(info?.uploader).toBe('Alice');
    expect(info?.formats).toHaveLength(1);
    const fmt = info?.formats[0];
    expect(fmt?.url).toBe(
      `https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`
    );
    expect(fmt?.extension).toBe('mp4');
    expect(fmt?.resolution).toBe('1080x1920');
    expect(fmt?.filesize).toBe(1234567);
  });

  it('returns null for a post with no video', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonRes({ did: 'did:plc:x' }))
      .mockResolvedValueOnce(
        jsonRes({ thread: { post: { record: { text: 'just text' } } } })
      );

    const info = await getInfo('https://bsky.app/profile/x/post/3k');
    expect(info).toBeNull();
  });

  it('follows a quoted post to find its video', async () => {
    const qDid = 'did:plc:quoted';
    const qRkey = '3quoted';
    const cid = 'bafyquotedvid';
    mockFetch
      .mockResolvedValueOnce(jsonRes({ did: 'did:plc:outer' }))
      .mockResolvedValueOnce(
        jsonRes({
          thread: {
            post: {
              record: {
                text: 'must watch',
                embed: {
                  $type: 'app.bsky.embed.record',
                  record: { uri: `at://${qDid}/app.bsky.feed.post/${qRkey}` },
                },
              },
              author: { displayName: 'Quoter' },
            },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonRes({
          thread: {
            post: {
              record: {
                text: 'original',
                embed: {
                  video: { ref: { $link: cid } },
                  aspectRatio: { width: 720, height: 1280 },
                },
              },
              embed: { thumbnail: 'https://cdn.bsky/q.jpg' },
            },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonRes({
          service: [
            {
              type: 'AtprotoPersonalDataServer',
              serviceEndpoint: 'https://pds.quoted.com',
            },
          ],
        })
      );

    const info = await getInfo('https://bsky.app/profile/quoter/post/3outer');
    expect(info).not.toBeNull();
    expect(info?.uploader).toBe('Quoter');
    expect(info?.formats[0].url).toBe(
      `https://pds.quoted.com/xrpc/com.atproto.sync.getBlob?did=${qDid}&cid=${cid}`
    );
  });
});
