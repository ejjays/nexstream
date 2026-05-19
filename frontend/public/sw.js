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
        } catch {
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
        } catch { /* empty */ }
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

    const headers = {
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    };

    const stream = new ReadableStream({
      async start(controller) {
        // Wait up to 5 seconds for the stream to be initialized via message
        let entry = streamStore.get(streamId);
        let attempts = 0;
        while (!entry && attempts < 50) {
          await new Promise(r => setTimeout(r, 100));
          entry = streamStore.get(streamId);
          attempts++;
        }

        if (!entry) {
          console.error(`[SW] Stream ${streamId} never initialized.`);
          try { controller.close(); } catch {
            // empty
          }
          return;
        }

        console.log(`[SW] ReadableStream starting for ${streamId}. Current buffer chunks: ${entry.buffer.length}`);
        
        // push buffer data
        entry.buffer.forEach(c => {
          try {
            controller.enqueue(c);
          } catch {
            // empty
          }
        });

        if (entry.done) {
          console.log('[SW] Stream was already done, closing controller immediately.');
          try {
            controller.close();
          } catch {
            // empty
          }
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
        const entry = streamStore.get(streamId);
        console.log(`[SW] Stream ${streamId} cancelled by browser/user.`);
        if (entry) entry.controllers.delete(controller);
      }
    });

    event.respondWith((async () => {
      // Small delay to let headers be populated from entry if size is known
      let entry = streamStore.get(streamId);
      if (!entry) await new Promise(r => setTimeout(r, 200));
      entry = streamStore.get(streamId);

      const lowFilename = filename.toLowerCase();
      const safeFilename = encodeURIComponent(filename);

      let contentType = 'video/mp4';
      if (lowFilename.endsWith('.mp3')) contentType = 'audio/mpeg';
      else if (lowFilename.endsWith('.webm') || lowFilename.endsWith('.mkv')) contentType = 'video/webm';
      else if (lowFilename.endsWith('.m4a')) contentType = 'audio/mp4';

      headers['Content-Type'] = contentType;
      headers['Content-Disposition'] = `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${safeFilename}`;
      
      if (entry && entry.size > 0) {
        headers['Content-Length'] = entry.size.toString();
      }

      return new Response(stream, { headers });
    })());
  }
});
