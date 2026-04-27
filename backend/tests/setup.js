import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { HttpResponse, http } from 'msw';
const EventEmitter = require('node:events');

// mock Redis
class MockRedis extends EventEmitter {
    constructor() {
        super();
        this.status = 'ready';
        process.nextTick(() => {
            this.emit('connect');
            this.emit('ready');
        });
    }
    subscribe() { return Promise.resolve(); }
    unsubscribe() { return Promise.resolve(); }
    publish() { return Promise.resolve(); }
    on(event, handler) { 
        if (event === 'ready' || event === 'connect') process.nextTick(handler);
        return super.on(event, handler);
    }
    once(event, handler) {
        if (event === 'ready' || event === 'connect') process.nextTick(handler);
        return super.once(event, handler);
    }
    quit() { return Promise.resolve(); }
    disconnect() {}
    duplicate() { return new MockRedis(); }
}

vi.mock('ioredis', () => ({
    default: MockRedis,
    Redis: MockRedis
}));

export const handlers = [
  // mock Spotify API
  http.get('https://api.spotify.com/v1/tracks/1xwtOTVFN4MsGEKpGyKfIV', () => {
    return HttpResponse.json({
      name: 'Awit Ng Bayan (Mocked)',
      artists: [{ name: 'Victory Worship' }],
      external_ids: { isrc: 'FR2X41721331' },
      album: { 
        name: 'Awit Ng Bayan', 
        images: [{ url: 'https://example.com/cover.jpg' }] 
      },
      duration_ms: 338000,
      preview_url: 'https://p.scdn.co/mp3-preview/mocked'
    });
  }),
  // mock Turso
  http.post('https://*.turso.io/v2/pipeline', () => {
    return HttpResponse.json({
      results: [{ 
        type: 'success', 
        response: { 
          type: 'execute', 
          result: { rows: [], cols: [], rows_affected: 0, last_insert_rowid: null } 
        } 
      }]
    });
  }),
  // mock Deezer
  http.get('https://api.deezer.com/track/isrc:isrc', () => {
    return HttpResponse.json({
      isrc: 'FR2X41721331',
      preview: 'https://example.com/preview.mp3'
    });
  }),
  http.get('https://api.deezer.com/search', () => {
    return HttpResponse.json({
      data: [{
        id: '12345',
        title: 'Mocked Song',
        artist: { name: 'Mocked Artist' },
        preview: 'https://example.com/preview.mp3',
        duration: 338
      }]
    });
  }),
  http.get('https://api.deezer.com/track/:id', () => {
    return HttpResponse.json({
      isrc: 'FR2X41721331',
      preview: 'https://example.com/preview.mp3'
    });
  }),
  // mock iTunes
  http.get('https://itunes.apple.com/search', () => {
    return HttpResponse.json({
      results: [{
        isrc: 'FR2X41721331',
        previewUrl: 'https://example.com/preview.mp3',
        trackTimeMillis: 338000
      }]
    });
  }),
  // mock Spotify token
  http.post('https://accounts.spotify.com/api/token', () => {
    return HttpResponse.json({
      access_token: 'mock-token',
      token_type: 'Bearer',
      expires_in: 3600
    });
  }),
  // mock Spotify
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
      duration_ms: 338000
    });
  }),
  // mock Spotify Embed
  http.get('https://open.spotify.com/embed/track/:id', () => {
    return new HttpResponse(`<html><body><script id="resource">${encodeURIComponent(JSON.stringify({ preview_url: 'https://p.scdn.co/mp3-preview/mocked' }))}</script></body></html>`, {
      headers: { 'Content-Type': 'text/html' }
    });
  }),
  // mock Spotify oEmbed
  http.get('https://open.spotify.com/oembed', () => {
    return HttpResponse.json({
      title: 'Awit Ng Bayan (Mocked)',
      thumbnail_url: 'https://example.com/cover.jpg'
    });
  }),
  // mock Soundcharts
  http.get('https://customer.api.soundcharts.com/api/v2.25/song/by-platform/spotify/:id', () => {
    return HttpResponse.json({
      object: {
        name: 'Awit Ng Bayan (Mocked)',
        artists: [{ name: 'Victory Worship' }],
        isrc: { value: 'FR2X41721331' },
        duration: 338,
        previewUrl: 'https://example.com/preview.mp3'
      }
    });
  }),
  // mock Odesli
  http.get('https://api.odesli.co/v1-alpha.1/links', () => {
    return HttpResponse.json({
      entitiesByUniqueId: {
        'mock': {
          title: 'Awit Ng Bayan (Mocked)',
          artistName: 'Victory Worship',
          platforms: ['spotify'],
          isrc: 'FR2X41721331'
        }
      },
      linksByPlatform: {
        youtube: { url: 'https://youtube.com/watch?v=mock' }
      }
    });
  }),
  // mock SoundCloud
  http.get('https://soundcloud.com/', () => {
    return new HttpResponse('<html><body>client_id:"ceeWbO4nf8MvuTeipNw0E3Lkh3NNxzMy"</body></html>', {
      headers: { 'Content-Type': 'text/html' }
    });
  }),
  // mock YouTube search (if needed by resolver)
  http.get('https://www.googleapis.com/youtube/v3/search', () => {
    return HttpResponse.json({
      items: [{
        id: { videoId: 'nAC_qg36itU' },
        snippet: { title: 'Awit Ng Bayan (Mocked)', channelTitle: 'Victory Worship' }
      }]
    });
  }),
  // fallback mocks
  http.get('https://gist.githubusercontent.com/**', () => new HttpResponse('')),
  http.get('https://www.youtube.com/**', () => new HttpResponse('')),
  http.post('https://api.groq.com/**', () => HttpResponse.json({})),
  http.post('https://aiplatform.googleapis.com/**', () => HttpResponse.json({})),
];

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
