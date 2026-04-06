// sse service
export class SSEService {
  constructor() {
    this.reader = null;
    this.controller = null;
  }

  async connect(url, onMessage, onError) {
    this.controller = new AbortController();
    
    try {
      const response = await fetch(url, {
        signal: this.controller.signal,
        headers: {
          'Accept': 'text/event-stream',
          'ngrok-skip-browser-warning': 'true'
        }
      });

      if (!response.ok) throw new Error(`SSE failed: ${response.status}`);

      this.reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // stream loop
      while (true) {
        const { done, value } = await this.reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // keep last partial line
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          try {
            const data = JSON.parse(trimmed.replace('data:', ''));
            onMessage(data);
          } catch (e) {
            // skip bad json
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      onError(err.message);
    }
  }

  disconnect() {
    if (this.controller) this.controller.abort();
    if (this.reader) this.reader.releaseLock();
  }
}
