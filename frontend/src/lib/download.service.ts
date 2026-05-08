
import { OPFSStorage } from './opfs';

export type DownloadUpdate =
  | { status: 'connecting'; progress: number }
  | { status: 'downloading'; progress: number }
  | { status: 'complete'; progress: number; file: File }
  | { status: 'error'; error: string };

export class DownloadService {
  private onUpdate: (data: DownloadUpdate) => void;
  private abortController: AbortController | null = null;

  constructor(onUpdate: (data: DownloadUpdate) => void) {
    this.onUpdate = onUpdate;
    this.abortController = null;
  }

  async start(
    url: string,
    filename: string,
    options: RequestInit = {}
  ): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      this.onUpdate({ status: 'connecting', progress: 0 });

      const response = await fetch(url, { signal, ...options });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      if (!response.body) throw new Error('Response body is null');
      const reader = response.body.getReader();
      const contentLength = Number(response.headers.get('Content-Length') || 0);
      const storage = await OPFSStorage.init(filename);
      if (!storage) throw new Error('Failed to initialize storage');

      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await storage.write(value);
        receivedLength += value.length;

        if (contentLength) {
          const progress = Math.round((receivedLength / contentLength) * 100);
          this.onUpdate({ status: 'downloading', progress });
        }
      }

      const file = await storage.getFile();
      this.onUpdate({ status: 'complete', progress: 100, file });
      await storage.close();
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : String(err);
      this.onUpdate({ status: 'error', error: message });
    }
  }
}

  cancel() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
