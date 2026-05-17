import { fetchEventSource } from '@microsoft/fetch-event-source';

export class SSEService {
  private controller: AbortController | null = null;
  private active: boolean = false;

  constructor() {
    this.controller = null;
    this.active = false;
  }

  async connect(
    url: string,
    onMessage: (data: unknown) => void,
    onError?: (err: unknown) => void,
    onOpen?: () => void
  ) {
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
            } catch (_e) {
              // ignore padding errors
            }
          }
        },
        onclose: () => {
          console.log('[SSE] Connection closed by server.');
        },
        onerror: (err: unknown) => {
          onError?.(err);
          // handle reconnection
        }
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const errorToReport = err instanceof Error ? err.message : err;
      onError?.(errorToReport);
    }
  }

  disconnect() {
    this.active = false;
    if (this.controller) {
      try {
        this.controller.abort();
      } catch (_e) { /* ignore */ }
    }
    this.controller = null;
  }
}
