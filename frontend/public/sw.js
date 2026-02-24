const CACHE_NAME = "nexstream-v32";
const streamStore = new Map();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.data.type === "STREAM_DATA") {
    const { filename, chunk, done, size } = event.data;
    if (!streamStore.has(filename)) {
      // Create a TransformStream for backpressure support
      const { readable, writable } = new TransformStream();
      streamStore.set(filename, { 
          controller: writable.getWriter(), 
          readable,
          size: size || 0 
      });
    }
    const entry = streamStore.get(filename);
    if (size) entry.size = size;

    if (chunk && entry.controller) {
        entry.controller.write(chunk);
    }
    if (done && entry.controller) {
        entry.controller.close();
        // Allow time for the browser to finish reading from the stream
        setTimeout(() => streamStore.delete(filename), 30000);
    }
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.includes("/EME_STREAM_DOWNLOAD/")) {
    const filename = decodeURIComponent(url.pathname.split("/").pop());
    
    // Check if stream exists or wait a tiny bit
    if (!streamStore.has(filename)) {
       const { readable, writable } = new TransformStream();
       streamStore.set(filename, { 
          controller: writable.getWriter(), 
          readable,
          size: 0 
       });
    }

    const entry = streamStore.get(filename);
    const isMp3 = filename.toLowerCase().endsWith(".mp3");
    const safeFilename = encodeURIComponent(filename);
    
    const headers = {
      "Content-Type": isMp3 ? "audio/mpeg" : "video/mp4",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${safeFilename}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache, no-store, must-revalidate"
    };

    if (entry.size > 0) {
      headers["Content-Length"] = entry.size.toString();
    }

    event.respondWith(new Response(entry.readable, { headers }));
  }
});
