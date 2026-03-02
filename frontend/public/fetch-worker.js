self.onmessage = async (e) => {
  const { url } = e.data;
  
  try {
    const headers = {};
    if (url.includes("ngrok")) headers["ngrok-skip-browser-warning"] = "true";

    const response = await fetch(url, { 
        headers,
        priority: 'high'
    });
    
    if (!response.ok) {
        throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }
    
    const contentLength = +response.headers.get('Content-Length') || 0;
    const reader = response.body.getReader();
    
    self.postMessage({ type: 'start', contentLength });

    // 512KB is the optimal balance for mobile thread communication
    const BUFFER_SIZE = 512 * 1024; 
    let buffer = new Uint8Array(BUFFER_SIZE);
    let offset = 0;
    let lastFlush = Date.now();

    while(true) {
      const {done, value} = await reader.read();
      
      if (value) {
          let pos = 0;
          while (pos < value.length) {
              const take = Math.min(value.length - pos, BUFFER_SIZE - offset);
              buffer.set(value.subarray(pos, pos + take), offset);
              offset += take;
              pos += take;

              // Flush if buffer is full or if we have data and it's been a while (200ms)
              if (offset === BUFFER_SIZE || (offset > 0 && Date.now() - lastFlush > 200)) {
                  const chunkToSend = offset === BUFFER_SIZE ? buffer : buffer.slice(0, offset);
                  self.postMessage({ type: 'chunk', chunk: chunkToSend }, [chunkToSend.buffer]);
                  
                  buffer = new Uint8Array(BUFFER_SIZE);
                  offset = 0;
                  lastFlush = Date.now();
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
