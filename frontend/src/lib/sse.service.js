import { fetchEventSource } from '@microsoft/fetch-event-source';

export class SSEService {
  constructor() {
    this.controller = null;
    this.active = false;
  }

  async connect(url, onMessage, onError, onOpen) {
    this.active = true;
    this.controller = new AbortController();

    try {
      await fetchEventSource(url, {
        signal: this.controller.signal,
        openWhenHidden: true,
        headers: {
          'Accept': 'text/event-stream',
          'ngrok-skip-browser-warning': 'true',
          'bypass-tunnel-reminder': 'true'
        },
        onopen: async (response) => {
          if (!response.ok) {
            throw new Error(`SSE failed: ${response.status}`);
          }
          if (onOpen) onOpen();
        },
        onmessage: (msg) => {
          if (!this.active) return;
          if (msg.data) {
            console.log("[SSE Raw Data]:", msg.data.substring(0, 100));
            try {
              const data = JSON.parse(msg.data);
              onMessage(data);
            } catch (e) {
              // ignore padding errors
            }
          }
        },
        onclose: () => {
          console.log('[SSE] Connection closed by server.');
        },
        onerror: (err) => {
          onError?.(err);
          // return error
          return err;
        }
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      onError?.(err.message);
    }
  }

  disconnect() {
    this.active = false;
    if (this.controller) {
      try {
        this.controller.abort();
      } catch(e) {}
    }
    this.controller = null;
  }
}
