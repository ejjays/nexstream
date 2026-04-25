import { beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { HttpResponse, http } from 'msw';

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
      duration_ms: 338000
    });
  }),

  // mock Spotify features
  http.get('https://api.spotify.com/v1/audio-features/1xwtOTVFN4MsGEKpGyKfIV', () => {
    return HttpResponse.json({
      key: 2,
      mode: 1,
      tempo: 128
    });
  }),

  // mock Deezer ISRC
  http.get('https://api.deezer.com/track/isrc:FR2X41721331', () => {
    return HttpResponse.json({
      title: 'Awit Ng Bayan',
      preview: 'https://example.com/preview.mp3'
    });
  }),

  // mock Turso DB
  http.post('https://*.turso.io/v2/pipeline', () => {
    return HttpResponse.json({
      results: [{ type: 'success', response: { type: 'execute', result: { rows: [] } } }]
    });
  })
];

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
