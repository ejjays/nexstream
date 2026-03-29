const CACHE_NAME = 'nexstream-v34';
const streamStore = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event =>
  event.waitUntil(self.clients.claim())
);

self.addEventListener('message', event => {
  if (event.data.type === 'STREAM_DATA') {
    const { streamId, chunk, done, size } = event.data;

    if (!streamStore.has(streamId)) {
      console.log(`[SW] Initializing stream entry for ${streamId}`);
      streamStore.set(streamId, {
        controllers: new Set(),
        buffer: [],
        bufferSize: 0,
        done: false,
        size: size || 0
      });
    }

    const entry = streamStore.get(streamId);
    if (size && size > 0) entry.size = size;

    if (chunk) {
      const u8 = new Uint8Array(chunk);
      // limit buffer size
      if (entry.bufferSize < 1024 * 1024 * 1024) {
        entry.buffer.push(u8);
        entry.bufferSize += u8.length;
      }
      
      entry.controllers.forEach(c => {
        try {
          c.enqueue(u8);
        } catch (e) {
          entry.controllers.delete(c);
        }
      });
    }

    if (done) {
      console.log(`[SW] Stream ${streamId} marked as DONE. Total size: ${entry.bufferSize}`);
      entry.done = true;
      entry.controllers.forEach(c => {
        try {
          c.close();
        } catch (e) {}
      });
      entry.controllers.clear();
      // five minute cache
      setTimeout(() => streamStore.delete(streamId), 300000);
    }
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname.includes('/EME_STREAM_DOWNLOAD/')) {
    const parts = url.pathname.split('/');
    const filename = decodeURIComponent(parts.pop());
    const streamId = decodeURIComponent(parts.pop());

    console.log(`[SW] Intercepting EME download for ${streamId} (${filename})`);

    if (!streamStore.has(streamId)) {
      console.warn(`[SW] Warning: StreamId ${streamId} not found in store, creating placeholder.`);
      streamStore.set(streamId, {
        controllers: new Set(),
        buffer: [],
        bufferSize: 0,
        done: false,
        size: 0
      });
    }

    const entry = streamStore.get(streamId);
    const lowFilename = filename.toLowerCase();
    const safeFilename = encodeURIComponent(filename);

    let contentType = 'video/mp4';
    if (lowFilename.endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (lowFilename.endsWith('.webm') || lowFilename.endsWith('.mkv')) contentType = 'video/webm';
    else if (lowFilename.endsWith('.m4a')) contentType = 'audio/mp4';

    const headers = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${safeFilename}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    };

    if (entry.size > 0) {
      headers['Content-Length'] = entry.size.toString();
    }

    const stream = new ReadableStream({
      start(controller) {
        console.log(`[SW] ReadableStream starting for ${streamId}. Current buffer chunks: ${entry.buffer.length}`);
        
        // push buffer data
        entry.buffer.forEach(c => {
          try {
            controller.enqueue(c);
          } catch (e) {}
        });

        if (entry.done) {
          console.log(`[SW] Stream was already done, closing controller immediately.`);
          try {
            controller.close();
          } catch (e) {}
        } else {
          entry.controllers.add(controller);
        }

        // notify client connection
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'STREAM_CONNECTED', streamId });
          });
        });
      },
      cancel(controller) {
        console.log(`[SW] Stream ${streamId} cancelled by browser/user.`);
        entry.controllers.delete(controller);
      }
    });

    event.respondWith(new Response(stream, { headers }));
  }
});
