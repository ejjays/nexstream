import { useRemixStore } from '../store/useRemixStore';
import { BACKEND_URL } from './config';
import { getSanitizedFilename, generateUUID } from './utils';
import { reportTelemetry } from './telemetry.service';
import { OPFSStorage } from './opfs';

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

  private getTS() {
    const start = useRemixStore.getState().sessionStartTime;
    if (!start) return "[0:00]";
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `[${mins}:${secs.toString().padStart(2, '0')}]`;
  }

  // server turbo
  async startServerDownload(params: any) {
    const { url, finalTitle, artist, selectedOption, formatId, serverClientId, targetUrl, selectedFormat, triggerMobileDownload, backendUrl: dynamicBackendUrl } = params;
    const backendUrl = dynamicBackendUrl || BACKEND_URL;
    
    this.onLog(`${this.getTS()} [System] Using Server-Side Turbo Engine...`);

    try {
      const cleanUrl = url.split('&id=')[0].split('?id=')[0];
      const finalFormatExtension =
        selectedFormat === 'mp4'
          ? (selectedOption?.extension || 'mp4')
          : selectedOption?.extension || selectedFormat;

      const finalFormatId = selectedOption?.format_id || formatId;

      const downloadUrl = `${backendUrl}/convert?url=${encodeURIComponent(cleanUrl)}&format=${finalFormatExtension}&formatId=${finalFormatId}&targetUrl=${encodeURIComponent(targetUrl || '')}&id=${serverClientId}&title=${encodeURIComponent(finalTitle)}&artist=${encodeURIComponent(artist)}&token=${serverClientId}`;

      const fileName = getSanitizedFilename(finalTitle, artist, finalFormatExtension, url.includes('spotify.com'));

      const wasTriggered = typeof triggerMobileDownload === 'function' && triggerMobileDownload({
        url: downloadUrl,
        filename: fileName,
        title: finalTitle,
        artist: artist,
        clientId: serverClientId
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
            this.onSubStatus("Successfully Sent to Device");
            this.onComplete();
            // cleanup cookie
            document.cookie = `download_token=${serverClientId}; Max-Age=0; Path=/`;
          }
        }, 150);

        // safety timeout
        setTimeout(() => clearInterval(syncInterval), 20000);
      }
    } catch (err: any) {
      this.onError(err.message);
    }
  }

  // edge muxing
  async startEdgeMuxing(params: any): Promise<boolean> {
    const { url, clientId, formatId, targetUrl, selectedFormat, finalTitle, artist, backendUrl: dynamicBackendUrl } = params;
    const backendUrl = dynamicBackendUrl || BACKEND_URL;
    
    // bypass EME
    // fallback turbo
    this.onLog(`${this.getTS()} [System] Client-side muxing bypassed for device compatibility. Falling back to Server Turbo.`);
    return false;
  }
}
