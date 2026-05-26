import { beforeAll, afterEach, afterAll, vi, expect } from 'vitest';
import { setupServer } from 'msw/node';
import { HttpResponse, http } from 'msw';
import Redis from 'ioredis-mock';

// global mocks
vi.mock('ioredis', () => ({
  default: Redis,
  Redis,
}));

// mock libsql
vi.mock('@libsql/client', () => ({
  createClient: vi.fn().mockReturnValue({
    // skipcq: JS-0116
    execute: vi.fn().mockImplementation(async (options) => {
       await Promise.resolve();
       const sql = typeof options === 'string' ? options : options.sql;
       console.debug(`[MockDB] Executing: ${sql.substring(0, 100)}...`);
       return { rows: [] };
    }),
  }),
}));

import db from '../src/utils/infra/db.util.js';

interface DBClient {
  execute: (
    options: string | { sql: string; args?: unknown[] }
  ) => Promise<unknown>;
}

async function initTestDb(client: DBClient) {
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS spotify_mappings (
      url TEXT PRIMARY KEY,
      title TEXT,
      artist TEXT,
      album TEXT,
      imageUrl TEXT,
      duration INTEGER,
      isrc TEXT,
      previewUrl TEXT,
      youtubeUrl TEXT,
      formats TEXT,
      audioFormats TEXT,
      audioFeatures TEXT,
      year TEXT,
      timestamp INTEGER
    )`);
    await client.execute('CREATE INDEX IF NOT EXISTS idx_spotify_isrc ON spotify_mappings(isrc)');
    await client.execute('CREATE INDEX IF NOT EXISTS idx_spotify_youtube ON spotify_mappings(youtubeUrl)');

    await client.execute(`CREATE TABLE IF NOT EXISTS configs (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      url TEXT,
      created_at INTEGER
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS remix_history (
      id TEXT PRIMARY KEY,
      name TEXT,
      stems TEXT,
      chords TEXT,
      beats TEXT,
      tempo REAL,
      engine TEXT,
      created_at INTEGER
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS volatile_links (
      url TEXT PRIMARY KEY,
      expires_at INTEGER,
      provider TEXT
    )`);

    console.log('[TestDB] Local SQLite schema initialized');
  } catch (error) {
    console.error('[TestDB] Initialization failed:', (error as Error).message);
  }
}

vi.mock('youtubei.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('youtubei.js')>();
  // mock streaming data
  const mockStreamingData = {
    formats: [
      {
        itag: 18,
        url: 'https://rr5---sn-n4v7kn7z.googlevideo.com/videoplayback?test18',
        mime_type: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
        width: 640,
        height: 360,
        quality_label: '360p',
        has_video: true,
        has_audio: true,
      },
      {
        itag: 136,
        url: 'https://rr5---sn-n4v7kn7z.googlevideo.com/videoplayback?test136',
        mime_type: 'video/mp4; codecs="avc1.4d401f"',
        width: 1280,
        height: 720,
        quality_label: '720p',
        has_video: true,
        has_audio: false,
      },
      {
        itag: 137,
        url: 'https://rr5---sn-n4v7kn7z.googlevideo.com/videoplayback?test137',
        mime_type: 'video/mp4; codecs="avc1.640028"',
        width: 1920,
        height: 1080,
        quality_label: '1080p',
        has_video: true,
        has_audio: false,
      },
    ],
    adaptive_formats: [],
  };
  const mockBasicInfoFull = {
    basic_info: {
      id: 'nTbA7qrEsP0',
      title: 'Awit Ng Bayan (Mocked)',
      author: 'Victory Worship',
      duration: 338,
      thumbnail: [{ url: 'https://example.com/thumb.jpg' }],
    },
    streaming_data: mockStreamingData,
  };
  return {
    ...actual,
    Innertube: {
      create: vi.fn().mockResolvedValue({
        search: vi.fn().mockResolvedValue({
          videos: [
            {
              id: 'nTbA7qrEsP0',
              title: 'Awit Ng Bayan (Mocked)',
              author: { name: 'Victory Worship' },
              thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
              duration: { seconds: 338 },
            },
          ],
        }),
        getInfo: vi.fn().mockResolvedValue(mockBasicInfoFull),
        getBasicInfo: vi.fn().mockResolvedValue(mockBasicInfoFull),
      }),
    },
  };
});

process.env.SPOTIFY_CLIENT_ID = 'mock-id';
process.env.SPOTIFY_CLIENT_SECRET = 'mock-secret';

vi.mock('better-sse', () => ({
  createSession: vi.fn().mockReturnValue({
    push: vi.fn(),
    on: vi.fn(),
  }),
  createChannel: vi.fn().mockReturnValue({
    register: vi.fn(),
    broadcast: vi.fn(),
  }),
}));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason);
});

export const handlers = [
  http.get('https://www.youtube.com/watch', () => {
    return new HttpResponse(
      '<html><head><title>Awit Ng Bayan (Mocked)</title><meta name="author" content="Victory Worship"></head><body></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }),
  http.get('https://youtu.be/:id', () => {
    return new HttpResponse(
      '<html><head><title>Awit Ng Bayan (Mocked)</title><meta name="author" content="Victory Worship"></head><body></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }),
  http.post('https://www.youtube.com/youtubei/v1/player', () => {
    return HttpResponse.json({
      videoDetails: {
        videoId: 'nTbA7qrEsP0',
        title: 'Awit Ng Bayan (Mocked)',
        author: 'Victory Worship',
        lengthSeconds: '338',
        thumbnail: {
          thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
        },
      },
      streamingData: {
        formats: [
          {
            itag: 18,
            url: 'https://rr5---sn-n4v7kn7z.googlevideo.com/videoplayback?test',
            mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
            width: 640,
            height: 360,
          },
        ],
      },
    });
  }),
  http.get('https://api.spotify.com/v1/tracks/:id', (req) => {
    if (req.params.id === 'error404') return new HttpResponse('Not Found', { status: 404 });
    return HttpResponse.json({
      name: 'Awit Ng Bayan (Mocked)',
      artists: [{ name: 'Victory Worship' }],
      external_ids: { isrc: 'FR2X41721331' },
      album: {
        name: 'Awit Ng Bayan',
        images: [{ url: 'https://example.com/cover.jpg' }],
      },
      duration_ms: 338000,
      preview_url: 'https://p.scdn.co/mp3-preview/mocked',
    });
  }),
  http.get('https://api.deezer.com/track/isrc:isrc', () => {
    return HttpResponse.json({
      isrc: 'FR2X41721331',
      preview: 'https://p.scdn.co/mp3-preview/mocked',
    });
  }),
  http.get('https://api.deezer.com/search', () => {
    return HttpResponse.json({
      data: [
        {
          id: '12345',
          title: 'Mocked Song',
          artist: { name: 'Mocked Artist' },
          preview: 'https://p.scdn.co/mp3-preview/mocked',
          duration: 338,
        },
      ],
    });
  }),
  http.get('https://api.deezer.com/track/:id', () => {
    return HttpResponse.json({
      isrc: 'FR2X41721331',
      preview: 'https://p.scdn.co/mp3-preview/mocked',
    });
  }),
  http.get('https://itunes.apple.com/search', () => {
    return HttpResponse.json({
      results: [
        {
          isrc: 'FR2X41721331',
          previewUrl: 'https://p.scdn.co/mp3-preview/mocked',
          trackTimeMillis: 338000,
        },
      ],
    });
  }),
  http.post('https://accounts.spotify.com/api/token', () => {
    return HttpResponse.json({
      access_token: 'mock-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
  }),
  http.get('https://api.spotify.com/v1/audio-features/:id', () => {
    return HttpResponse.json({
      danceability: 0.5,
      energy: 0.5,
      key: 5,
      loudness: -5,
      mode: 1,
      speechiness: 0.05,
      acousticness: 0.2,
      instrumentalness: 0,
      liveness: 0.1,
      valence: 0.5,
      tempo: 120,
      id: '1xwtOTVFN4MsGEKpGyKfIV',
      duration_ms: 338000,
    });
  }),
  http.get('https://open.spotify.com/embed/track/:id', () => {
    return new HttpResponse(
      `<html><body><script id="resource">${encodeURIComponent(JSON.stringify({ preview_url: 'https://p.scdn.co/mp3-preview/mocked' }))}</script></body></html>`,
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }),
  http.get('https://open.spotify.com/oembed', (req) => {
    const url = new URL(req.request.url);
    const target = url.searchParams.get('url');
    if (target?.includes('error404')) return new HttpResponse('Not Found', { status: 404 });
    return HttpResponse.json({
      title: 'Awit Ng Bayan (Mocked)',
      thumbnail_url: 'https://example.com/cover.jpg',
    });
  }),
  http.get(
    'https://customer.api.soundcharts.com/api/v2.25/song/by-platform/spotify/:id',
    (req) => {
      if (req.params.id === 'error404') return new HttpResponse('Not Found', { status: 404 });
      return HttpResponse.json({
        object: {
          name: 'Awit Ng Bayan (Mocked)',
          artists: [{ name: 'Victory Worship' }],
          isrc: { value: 'FR2X41721331' },
          duration: 338,
          previewUrl: 'https://p.scdn.co/mp3-preview/mocked',
        },
      });
    }
  ),
  http.get('https://api.odesli.co/v1-alpha.1/links', (req) => {
    const url = new URL(req.request.url);
    const target = url.searchParams.get('url');
    if (target?.includes('error404')) return new HttpResponse('Not Found', { status: 404 });
    return HttpResponse.json({
      entitiesByUniqueId: {
        mock: {
          title: 'Awit Ng Bayan (Mocked)',
          artistName: 'Victory Worship',
          platforms: ['spotify'],
          isrc: 'FR2X41721331',
        },
      },
      linksByPlatform: {
        youtube: { url: 'https://youtube.com/watch?v=nTbA7qrEsP0' },
      },
    });
  }),
  http.get('https://soundcloud.com/', () => {
    return new HttpResponse(
      '<html><body>client_id:"ceeWbO4nf8MvuTeipNw0E3Lkh3NNxzMy"</body></html>',
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }),
  http.get('https://www.googleapis.com/youtube/v3/search', () => {
    return HttpResponse.json({
      items: [
        {
          id: { videoId: 'nAC_qg36itU' },
          snippet: {
            title: 'Awit Ng Bayan (Mocked)',
            channelTitle: 'Victory Worship',
          },
        },
      ],
    });
  }),
  http.post('https://api.groq.com/**', () => HttpResponse.json({})),
  http.post('https://aiplatform.googleapis.com/**', () =>
    HttpResponse.json({})
  ),
  http.get('https://vt.tiktok.com/ZS9PxUwTM/', () => {
     return HttpResponse.redirect('https://www.tiktok.com/@test/video/123456', 302);
  }),
  http.get('https://www.tiktok.com/@test/video/123456', () => {
    return new HttpResponse(
      "<html><body><script>var data = { \"video_id\":\"123456\", \"share_title\":\"Test Title\", \"author_name\":\"Test Author\", \"cover_data\":{\"url_list\":[\"https://thumb.jpg\"]}, \"play_addr\":{\"url_list\":[\"https://video.tiktok.com/v/test.mp4\"]} };</script></body></html>",
      { headers: { 'Content-Type': 'text/html' } }
    );
  }),
  http.get('https://www.tiktok.com/@error/video/404', () => {
    return new HttpResponse('Not Found', { status: 404 });
  }),
  http.get('https://www.tiktok.com/@error/video/malformed', () => {
    return new HttpResponse('<html><body>No data here</body></html>', {
      headers: { 'Content-Type': 'text/html' },
    });
  }),
  http.get('https://www.facebook.com/share/r/1KJUSQ3JkR/', () => {
    return new HttpResponse(
      "<html><body><script>{\"owner\":{\"name\":\"Test User\"}} {\"message\":{\"text\":\"Test Title\"}} {\"video_id\":\"123456\",\"browser_native_hd_url\":\"https://fb.com/video.mp4\",\"audioUrl\":\"https://fb.com/audio.mp4\"}</script></body></html>",
      { headers: { 'Content-Type': 'text/html' } }
    );
  }),
  http.get('https://www.facebook.com/watch/', (req) => {
    const url = new URL(req.request.url);
    const videoId = url.searchParams.get('v');
    if (videoId === '404') return new HttpResponse('Not Found', { status: 404 });
    if (videoId === 'bad') return new HttpResponse('<html><body>No data</body></html>', { headers: { 'Content-Type': 'text/html' } });
    return new HttpResponse('OK');
  }),
  http.get('https://www.instagram.com/reel/DFQe23tOWKz/', (req) => {
    const url = new URL(req.request.url);
    if (url.searchParams.get('__a') === '1') {
      return HttpResponse.json({
         items: [{
           pk: "123456",
           id: "123456",
           caption: { text: "Test Title #awesome" },
           user: { full_name: "Test User", username: "test_user" },
           image_versions2: { candidates: [{ url: "https://thumb.jpg" }] },
           video_versions: [{ id: "hd", url: "https://scontent.cdninstagram.com/v/test.mp4", width: 1080, height: 1920 }]
         }]
      });
    }
    return new HttpResponse(
      "<html><body><script>window.__additionalDataLoaded('feed', { \"shortcode_media\": { \"video_url\": \"https://scontent.cdninstagram.com/v/test.mp4\", \"display_url\": \"https://thumb.jpg\", \"owner\": { \"username\": \"test_user\" }, \"edge_media_to_caption\": { \"edges\": [{ \"node\": { \"text\": \"Test Title #awesome\" } }] } } });</script></body></html>",
      { headers: { 'Content-Type': 'text/html' } }
    );
  }),
  http.get('https://api.instagram.com/oembed', () => {
    return HttpResponse.json({
      title: 'OEmbed Title',
      author_name: 'OEmbed Author',
      thumbnail_url: 'https://thumb.jpg',
    });
  }),
];

export const server = setupServer(...handlers);

beforeAll(async () => {
  const testPath = expect.getState().testPath;
  const isLiveTest = testPath?.includes('live.test.ts');

  if (!isLiveTest) {
    server.listen({ onUnhandledRequest: 'bypass' });
    if (db) {
      await initTestDb(db);
    }
  }
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
