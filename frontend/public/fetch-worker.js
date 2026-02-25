self.onmessage = async (e) => {
  const { url } = e.data;
  
  try {
    const headers = {};
    if (url.includes("ngrok")) headers["ngrok-skip-browser-warning"] = "true";

    // Use absolute URL to ensure we hit the correct backend port (5000)
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
        throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }
    
    const contentLength = +response.headers.get('Content-Length') || 0;
    const reader = response.body.getReader();
    
    self.postMessage({ type: 'start', contentLength });

    // Aggregate chunks into 1MB blocks to maximize throughput
    const CHUNK_SIZE = 1024 * 1024;
    let buffer = new Uint8Array(CHUNK_SIZE);
    let offset = 0;

    while(true) {
      const {done, value} = await reader.read();
      
      if (value) {
          let pos = 0;
          while (pos < value.length) {
              const take = Math.min(value.length - pos, CHUNK_SIZE - offset);
              buffer.set(value.subarray(pos, pos + take), offset);
              offset += take;
              pos += take;

              if (offset === CHUNK_SIZE) {
                  self.postMessage({ type: 'chunk', chunk: buffer }, [buffer.buffer]);
                  buffer = new Uint8Array(CHUNK_SIZE);
                  offset = 0;
              }
          }
      }

      if (done) {
        if (offset > 0) {
            const finalChunk = buffer.slice(0, offset);
            self.postMessage({ type: 'chunk', chunk: finalChunk }, [finalChunk.buffer]);
        }
        break;
      }
    }
    
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
