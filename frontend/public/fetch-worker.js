self.onmessage = async (e) => {
  const { url } = e.data;
  
  try {
    const response = await fetch(url, {
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    
    if (!response.ok) throw new Error(`Failed to fetch ${url}`);
    
    // Send the stream itself (Transferable!)
    // This allows the receiver to read directly from the network socket
    self.postMessage({
      type: 'stream',
      stream: response.body,
      contentLength: +response.headers.get('Content-Length') || 0
    }, [response.body]);
    
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
