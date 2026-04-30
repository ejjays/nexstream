
import { OPFSStorage } from './opfs';

export class DownloadService {
  private onUpdate: (data: any) => void;
  private abortController: AbortController | null = null;

  constructor(onUpdate: (data: any) => void) {
    this.onUpdate = onUpdate; // status, progress, error
    this.abortController = null;
  }

  async start(url: string, filename: string, options: any = {}) {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      this.onUpdate({ status: 'connecting', progress: 0 });

      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      if (!response.body) throw new Error("Response body is null");
      const reader = response.body.getReader();
      const contentLength = +(response.headers.get('Content-Length') || 0);
      const storage = await OPFSStorage.init(filename);
      if (!storage) throw new Error("Failed to initialize storage");
      
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await storage.write(value);
        receivedLength += value.length;

        if (contentLength) {
          const progress = Math.round((receivedLength / contentLength) * 100);
          this.onUpdate({ progress, status: 'downloading' });
        }
      }

      const file = await storage.getFile();
      this.onUpdate({ status: 'complete', progress: 100, file });
      await storage.close();

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.onUpdate({ status: 'error', error: err.message });
    }
  }

  cancel() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
