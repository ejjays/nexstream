// @ts-nocheck
import { OPFSStorage } from './opfs';

export class DownloadService {
  constructor(onUpdate) {
    this.onUpdate = onUpdate; // status, progress, error
    this.abortController = null;
  }

  async start(url, filename, options = {}) {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      this.onUpdate({ status: 'connecting', progress: 0 });

      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      const reader = response.body.getReader();
      const contentLength = +response.headers.get('Content-Length');
      const storage = await OPFSStorage.init(filename);
      
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

    } catch (err) {
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
