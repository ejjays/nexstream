import { useRemixStore } from '../store/useRemixStore';
import { BACKEND_URL } from './config';
import { getSanitizedFilename } from './utils';

export interface OrchestratorCallbacks {
  onStatus?: (status: string) => void;
  onProgress?: (progress: number) => void;
  onSubStatus?: (subStatus: string) => void;
  onLog?: (log: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

// orchestrator core
export class OrchestratorService {
  private onStatus: (status: string) => void;
  private onProgress: (progress: number) => void;
  private onSubStatus: (subStatus: string) => void;
  private onLog: (log: string) => void;
  private onError: (error: string) => void;
  private onComplete: () => void;

  constructor(callbacks: OrchestratorCallbacks = {}) {
    this.onStatus = callbacks.onStatus || (() => {});
    this.onProgress = callbacks.onProgress || (() => {});
    this.onSubStatus = callbacks.onSubStatus || (() => {});
    this.onLog = callbacks.onLog || (() => {});
    this.onError = callbacks.onError || (() => {});
    this.onComplete = callbacks.onComplete || (() => {});
  }

  private static getTS() {
    const start = useRemixStore.getState().sessionStartTime;
    if (!start) return '[0:00]';
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `[${mins}:${secs.toString().padStart(2, '0')}]`;
  }

  // server turbo
  async startServerDownload(params: {
    url: string;
    finalTitle: string;
    artist: string;
    selectedOption?: { extension?: string; formatId?: string | number };
    formatId: string | number;
    serverClientId: string;
    targetUrl?: string;
    selectedFormat: string;
    triggerMobileDownload?: (options: {
      url: string;
      filename: string;
      title: string;
      artist: string;
      clientId: string;
    }) => boolean | undefined;
    backendUrl?: string;
  }): Promise<void> {
    const {
      url,
      finalTitle,
      artist,
      selectedOption,
      formatId,
      serverClientId,
      targetUrl,
      selectedFormat,
      triggerMobileDownload,
      backendUrl: dynamicBackendUrl,
    } = params;
    const backendUrl = dynamicBackendUrl || BACKEND_URL;

    this.onLog(
      `${OrchestratorService.getTS()} [System] Using Server-Side Turbo Engine...`
    );

    try {
      const cleanUrl = url.split('&id=')[0].split('?id=')[0];
      const finalFormatExtension =
        selectedFormat === 'mp4'
          ? selectedOption?.extension || 'mp4'
          : selectedOption?.extension || selectedFormat;

      const finalFormatId = selectedOption?.formatId || formatId;

      const downloadUrl = `${backendUrl}/convert?url=${encodeURIComponent(cleanUrl)}&format=${finalFormatExtension}&formatId=${finalFormatId}&targetUrl=${encodeURIComponent(targetUrl || '')}&id=${serverClientId}&title=${encodeURIComponent(finalTitle)}&artist=${encodeURIComponent(artist)}&token=${serverClientId}`;

      const fileName = getSanitizedFilename(
        finalTitle,
        artist,
        finalFormatExtension,
        url.includes('spotify.com')
      );

      const wasTriggered =
        typeof triggerMobileDownload === 'function' &&
        triggerMobileDownload({
          url: downloadUrl,
          filename: fileName,
          title: finalTitle,
          artist,
          clientId: serverClientId,
        });

      if (wasTriggered) {
        // bridge handled it
        setTimeout(() => this.onComplete(), 500);
      } else {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // sync with browser
        const syncInterval = setInterval(() => {
          if (document.cookie.includes(`download_token=${serverClientId}`)) {
            clearInterval(syncInterval);
            this.onProgress(100);
            this.onSubStatus('Successfully Sent to Device');
            this.onComplete();
            // cleanup cookie
            document.cookie = `download_token=${serverClientId}; Max-Age=0; Path=/`;
          }
        }, 150);

        // safety timeout
        setTimeout(() => clearInterval(syncInterval), 20000);
      }
      await Promise.resolve(); // satisfy require-await
    } catch (err: unknown) {
      const error = err as Error;
      this.onError(error.message);
    }
  }

  // edge muxing
  async startEdgeMuxing(_params: {
    url: string;
    clientId: string;
    formatId: string;
    targetUrl: string;
    videoData?: unknown;
    selectedFormat: string;
    finalTitle: string;
    artist: string;
    backendUrl?: string;
  }): Promise<boolean> {
    // bypass eme
    // fallback turbo
    this.onLog(
      `${OrchestratorService.getTS()} [System] Client-side muxing bypassed for device compatibility. Falling back to Server Turbo.`
    );
    return await Promise.resolve(false);
  }
}
