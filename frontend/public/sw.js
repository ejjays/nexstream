const CACHE_NAME = "nexstream-v33";
const streamStore = new Map();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.data.type === "STREAM_DATA") {
    const { streamId, chunk, done, size } = event.data;
    if (!streamStore.has(streamId)) {
      const { readable, writable } = new TransformStream();
      streamStore.set(streamId, { 
          writer: writable.getWriter(), 
          readable,
          size: size || 0 
      });
    }
    const entry = streamStore.get(streamId);
    if (size) entry.size = size;

    if (chunk && entry.writer) {
        entry.writer.write(new Uint8Array(chunk));
    }
    if (done && entry.writer) {
        entry.writer.close();
        setTimeout(() => streamStore.delete(streamId), 30000);
    }
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.includes("/EME_STREAM_DOWNLOAD/")) {
    const parts = url.pathname.split("/");
    // Pattern: /EME_STREAM_DOWNLOAD/{streamId}/{filename}
    const filename = decodeURIComponent(parts.pop());
    const streamId = decodeURIComponent(parts.pop());
    
    if (!streamStore.has(streamId)) {
       const { readable, writable } = new TransformStream();
       streamStore.set(streamId, { 
          writer: writable.getWriter(), 
          readable,
          size: 0 
       });
    }

    const entry = streamStore.get(streamId);
    const lowFilename = filename.toLowerCase();
    const isMp3 = lowFilename.endsWith(".mp3");
    const isWebm = lowFilename.endsWith(".webm");
    const isM4a = lowFilename.endsWith(".m4a");
    const safeFilename = encodeURIComponent(filename);
    
    let contentType = "video/mp4";
    if (isMp3) contentType = "audio/mpeg";
    else if (isWebm) contentType = "video/webm";
    else if (isM4a) contentType = "audio/mp4";
    
    const headers = {
      "Content-Type": contentType,
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
