const CACHE_NAME = "nexstream-v33";
const streamStore = new Map();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.origin !== self.location.origin && event.origin !== "") {
  }

  if (event.data.type === "STREAM_DATA") {
    const { streamId, chunk, done, size } = event.data;
    
    if (!streamStore.has(streamId)) {
      streamStore.set(streamId, { 
          controllers: [],
          buffer: [],
          bufferSize: 0,
          done: false,
          size: size || 0 
      });
    }
    
    const entry = streamStore.get(streamId);
    if (size) entry.size = size;

    if (chunk) {
        const u8 = new Uint8Array(chunk);
        if (entry.bufferSize < 512 * 1024) {
            entry.buffer.push(u8);
            entry.bufferSize += u8.length;
        }
        entry.controllers.forEach(c => {
            try { c.enqueue(u8); } catch(e) {}
        });
    }
    
    if (done) {
        entry.done = true;
        entry.controllers.forEach(c => {
            try { c.close(); } catch(e) {}
        });
        entry.controllers = [];
        setTimeout(() => streamStore.delete(streamId), 60000);
    }
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.includes("/EME_STREAM_DOWNLOAD/")) {
    const parts = url.pathname.split("/");
    const filename = decodeURIComponent(parts.pop());
    const streamId = decodeURIComponent(parts.pop());
    
    if (!streamStore.has(streamId)) {
      streamStore.set(streamId, { 
          controllers: [],
          buffer: [],
          bufferSize: 0,
          done: false,
          size: 0 
      });
    }

    const entry = streamStore.get(streamId);
    const lowFilename = filename.toLowerCase();
    const isMp3 = lowFilename.endsWith(".mp3");
    const isWebm = lowFilename.endsWith(".webm");
    const isMkv = lowFilename.endsWith(".mkv");
    const isM4a = lowFilename.endsWith(".m4a");
    const safeFilename = encodeURIComponent(filename);
    
    let contentType = "video/mp4";
    if (isMp3) contentType = "audio/mpeg";
    else if (isWebm || isMkv) contentType = "video/webm";
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

    const stream = new ReadableStream({
        start(controller) {
            entry.buffer.forEach(c => controller.enqueue(c));
            
            if (entry.done) {
                controller.close();
            } else {
                entry.controllers.push(controller);
            }
        },
        cancel() {
            entry.controllers = entry.controllers.filter(c => c !== controller);
        }
    });

    event.respondWith(new Response(stream, { headers }));
  }
});
