import { useRemixStore } from '../store/useRemixStore';
import { BACKEND_URL } from './config';
import { getSanitizedFilename } from './utils';
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
            // cleanup handshake cookie
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
  async startEdgeMuxing(params: any) {
    const { url, clientId, formatId, targetUrl, videoData, selectedFormat, finalTitle, artist, generateUUID, backendUrl: dynamicBackendUrl } = params;
    const backendUrl = dynamicBackendUrl || BACKEND_URL;
    
    try {
      this.onLog(`[System] Edge Muxing Engine: INITIALIZING...`);
      const cleanUrl = url.split('&id=')[0].split('?id=')[0];
      reportTelemetry('START', { url: cleanUrl }, clientId);

      const queryParams = new URLSearchParams({ url: cleanUrl, id: clientId, formatId, targetUrl });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        this.onLog(`${this.getTS()} [System] Edge Muxing Engine: REQUEST_TIMEOUT`);
        controller.abort();
      }, 30000);

      const urlResponse = await fetch(`${backendUrl}/stream-urls?${queryParams}`, {
        signal: controller.signal,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      }).catch((err) => {
        this.onLog(`${this.getTS()} [System] Network Error: ${err.name === 'AbortError' ? 'Timeout' : err.message}`);
        return { ok: false } as any;
      });
      clearTimeout(timeoutId);

      if (urlResponse.ok) {
        const responseData = await urlResponse.json();
        if (responseData.status === 'local-processing') {
          this.onLog(`${this.getTS()} [System] Edge Muxing Engine: DATA_PIPE_ESTABLISHED`);
          const { tunnel, output, videoUrl } = responseData;
          const { filename, totalSize } = output;

          const safeFilename = filename.replace(/[<>:"/\|?*]/g, '').trim() || 'video';
          const streamId = generateUUID();

          // setup stream
          const isSwReady = navigator.serviceWorker.controller !== null;
          
          const pumpChunk = (chunk: any, done = false, size = 0) => {
            if (isSwReady && navigator.serviceWorker.controller) {
              const message = { type: 'STREAM_DATA', streamId, chunk, done, size };
              if (chunk) {
                navigator.serviceWorker.controller.postMessage(message, [chunk.buffer]);
              } else {
                navigator.serviceWorker.controller.postMessage(message);
              }
            }
          };

          const triggerDownload = () => {
            if (isSwReady) {
              const streamUrl = `/EME_STREAM_DOWNLOAD/${streamId}/${encodeURIComponent(safeFilename)}`;
              const link = document.createElement('a');
              link.href = streamUrl;
              link.download = safeFilename;
              link.style.display = 'none';
              document.body.appendChild(link);
              try { link.click(); } catch (e) { window.location.assign(streamUrl); }
              setTimeout(() => { if (document.body.contains(link)) document.body.removeChild(link); }, 5000);
            } else {
              this.onError("Browser background process not ready.");
            }
          };

          const swConnectionPromise = new Promise<void>(resolve => {
            const connHandler = (e: MessageEvent) => {
              if (e.data.type === 'STREAM_CONNECTED' && e.data.streamId === streamId) {
                navigator.serviceWorker.removeEventListener('message', connHandler);
                resolve();
              }
            };
            navigator.serviceWorker.addEventListener('message', connHandler);
            setTimeout(resolve, 2000);
          });

          const onProgress = (s: string, p: number, extra: any) => {
            this.onStatus('eme_downloading');
            this.onProgress(p);
            if (extra.subStatus) {
              this.onSubStatus(extra.subStatus);
              if (!extra.subStatus.includes('%')) {
                this.onLog(`${this.getTS()} [EME] ${extra.subStatus}`);
              }
            }
          };

          const pumpFile = async (input: any, totalSize: number) => {
            const isFile = input instanceof File || input instanceof Blob;
            const stream = isFile ? (input as any).stream() : input.body;
            const reader = stream.getReader();
            let received = 0;
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                received += value.length;
                pumpChunk(value, false, totalSize);
                if (received % (10 * 1024 * 1024) < value.length) {
                  this.onSubStatus(`SUCCESS: Transmitting ${(received / 1024 / 1024).toFixed(1)}MB`);
                }
              }
              pumpChunk(null, true, totalSize);
              this.onLog(`${this.getTS()} [System] Stream transmission complete.`);
            } catch (err) {
              throw err;
            }
          };

          // tunnel selection
          if (tunnel.length === 1 && tunnel[0].includes('/convert')) {
            this.onLog(`${this.getTS()} [System] Turbo Engine: STREAM_READY`);
            this.onSubStatus('SUCCESS: Check Browser Downloads');
            this.onStatus('completed');
            this.onProgress(100);
            const link = document.createElement('a');
            link.href = tunnel[0];
            link.download = safeFilename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return true;
          } else if (tunnel.length > 0) {
            const isAudioFormat = selectedFormat === 'mp3' || selectedFormat === 'm4a' || !videoUrl;
            if (isAudioFormat) {
              const { processAudioOnly } = await import('./muxer');
              this.onLog(`${this.getTS()} [System] Edge Muxing Engine: STARTING_BITSTREAM_PIPE`);
              let coverBlob = null;
              if (videoData?.thumbnail || videoData?.cover) {
                try {
                  const cRes = await fetch(videoData.cover || videoData.thumbnail);
                  if (cRes.ok) coverBlob = await cRes.blob();
                } catch (e) {}
              }
              const result = await processAudioOnly(tunnel[0], { title: finalTitle, artist, album: videoData?.album || '', coverBlob }, onProgress, (msg: string) => this.onLog(`${this.getTS()} [EME_LOG] ${msg}`), () => {});
              if (result && result.file) {
                this.onStatus('completed');
                this.onSubStatus('SUCCESS: Check Browser Downloads');
                pumpChunk(null, false, result.size);
                triggerDownload();
                await swConnectionPromise;
                await pumpFile(result.file, result.size);
                const ext = (result.file as File).name.split('.').pop();
                const s = await OPFSStorage.init(`audio-output.${ext}`, false);
                if (s) await s.delete();
                return true;
              }
            } else {
              this.onLog(`${this.getTS()} [System] Edge Muxing Engine: STARTING_DIRECT_TUNNEL`);
              const fetchResponse = await fetch(tunnel[0]);
              if (!fetchResponse.ok) throw new Error("Failed to fetch direct tunnel.");
              const contentLength = +(fetchResponse.headers.get('Content-Length') || '') || totalSize || 0;
              this.onStatus('completed');
              this.onSubStatus('SUCCESS: Check Browser Downloads');
              pumpChunk(null, false, contentLength);
              triggerDownload();
              await swConnectionPromise;
              await pumpFile(fetchResponse, contentLength);
              return true;
            }
          }
        }
      }
      return false;
    } catch (err: any) {
      this.onLog(`${this.getTS()} [System] Muxing failed: ${err.message}`);
      return false;
    }
  }
}
