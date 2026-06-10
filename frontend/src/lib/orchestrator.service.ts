import { useRemixStore } from '../store/useRemixStore';
import { BACKEND_URL } from './config';
import { getSanitizedFilename } from './utils';
import { resolveStreamUrls } from './previewStream';
import { muxToMp4, isClientMuxSupported } from './muxer';
import { recordEmeAttempt, recordEmeOutcome } from './emeTelemetry';

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
  private muxController: AbortController | null = null;
  private cancelled = false;

  constructor(callbacks: OrchestratorCallbacks = {}) {
    this.onStatus = callbacks.onStatus || (() => {});
    this.onProgress = callbacks.onProgress || (() => {});
    this.onSubStatus = callbacks.onSubStatus || (() => {});
    this.onLog = callbacks.onLog || (() => {});
    this.onError = callbacks.onError || (() => {});
    this.onComplete = callbacks.onComplete || (() => {});
  }

  cancel(): void {
    this.cancelled = true;
    if (this.muxController) {
      this.muxController.abort();
      this.muxController = null;
    }
    useRemixStore.getState().setEmePhase(null);
    useRemixStore.getState().setEmeBytes(null);
  }

  wasCancelled(): boolean {
    return this.cancelled;
  }

  private static getTS() {
    const start = useRemixStore.getState().sessionStartTime;
    if (!start) return '[0:00]';
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `[${mins}:${secs.toString().padStart(2, '0')}]`;
  }

  // direct cdn download; bypasses server egress cap
  async startDirectDownload(params: {
    url: string;
    finalTitle: string;
    artist: string;
    selectedOption?: { extension?: string; formatId?: string | number };
    formatId: string | number;
    clientId: string;
    backendUrl?: string;
  }): Promise<boolean> {
    const { url, finalTitle, artist, selectedOption, formatId, clientId } =
      params;
    const backendUrl = params.backendUrl || BACKEND_URL;

    // native bridge keeps the server path
    if (typeof window === 'undefined' || 'ReactNativeWebView' in window) {
      return false;
    }
    // proven open-cors hosts only
    if (!/facebook\.com|fb\.watch|instagram\.com/i.test(url)) return false;

    try {
      const cleanUrl = url.split('&id=')[0].split('?id=')[0];
      const { directUrl, audioUrl } = await resolveStreamUrls(backendUrl,
      cleanUrl,
      String(formatId),
      clientId, true);
      // need a single progressive stream
      if (!directUrl || audioUrl) return false;

      const fileName = getSanitizedFilename(
        finalTitle,
        artist,
        selectedOption?.extension || 'mp4',
        false
      );
      this.onLog(
        `${OrchestratorService.getTS()} [System] Direct CDN stream (bypassing server cap)...`
      );
      this.onSubStatus('Streaming at full speed from source...');

      const resp = await fetch(directUrl);
      if (!resp.ok || !resp.body) return false;

      const total = Number(resp.headers.get('content-length')) || 0;
      const reader = resp.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;
      let streaming = true;
      while (streaming) {
        const { done, value } = await reader.read();
        if (value) {
          chunks.push(value);
          received += value.length;
          if (total) {
            this.onProgress(Math.min(99, Math.round((received / total) * 100)));
          }
        }
        streaming = !done;
      }

      const blob = new Blob(chunks, { type: 'video/mp4' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

      this.onProgress(100);
      this.onSubStatus('Successfully Sent to Device');
      this.onComplete();
      return true;
    } catch {
      return false;
    }
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
            document.cookie = `download_token=${serverClientId}; Max-Age=0; Path=/`;
          }
        }, 150);

        setTimeout(() => clearInterval(syncInterval), 20000);
      }
      await Promise.resolve();
    } catch (err: unknown) {
      const error = err as Error;
      this.onError(error.message);
    }
  }

  // edge muxing
  async startEdgeMuxing(params: {
    url: string;
    clientId: string;
    formatId: string;
    targetUrl: string;
    videoData?: unknown;
    selectedFormat: string;
    finalTitle: string;
    artist: string;
    backendUrl?: string;
    videoBytes?: number;
  }): Promise<boolean> {
    const { url, clientId, formatId, selectedFormat, finalTitle, artist } =
      params;
    const backendUrl = params.backendUrl || BACKEND_URL;
    this.cancelled = false;

    // only video copy-mux runs client-side
    if (selectedFormat !== 'mp4' || !isClientMuxSupported()) return false;
    // native bridge keeps the server path
    if (typeof window === 'undefined' || 'ReactNativeWebView' in window) {
      return false;
    }

    try {
      recordEmeAttempt();
      const cleanUrl = url.split('&id=')[0].split('?id=')[0];
      this.onSubStatus('Processing on your device...');
      this.onStatus('eme_downloading');
      useRemixStore.getState().setEmePhase('download');
      useRemixStore.getState().setEmeProgress(0);
      useRemixStore.getState().setEmeBytes(null);

      const { videoUrl, audioUrl, directUrl } = await resolveStreamUrls(backendUrl,
      cleanUrl,
      String(formatId),
      clientId, true);
      const videoSrc = videoUrl || directUrl;
      // only separate video+audio needs muxing
      if (!videoSrc || !audioUrl) {
        useRemixStore.getState().setEmePhase(null);
        recordEmeOutcome('skip', 'no_separate_streams');
        return false;
      }

      this.onLog(
        `${OrchestratorService.getTS()} [System] Client-side muxing via mediabunny (no server)...`
      );

      const controller = (this.muxController = new AbortController());
      const meta = params.videoData as { duration?: number } | undefined;
      const blob = await muxToMp4({
        videoUrl: videoSrc,
        audioUrl,
        signal: controller.signal,
        onProgress: (pct, detail, bytes) => {
          useRemixStore.getState().setEmeProgress(pct);
          this.onProgress(pct);
          if (bytes) useRemixStore.getState().setEmeBytes(bytes);
          if (detail?.startsWith('Muxing')) {
            this.onStatus('eme_muxing');
            useRemixStore.getState().setEmePhase('mux');
            useRemixStore.getState().setEmeBytes(null);
          }
        },
        metadata: { title: finalTitle, artist },
        durationHint:
          typeof meta?.duration === 'number' ? meta.duration : undefined,
        videoBytesHint:
          typeof params.videoBytes === 'number' ? params.videoBytes : undefined,
      });

      const fileName = getSanitizedFilename(finalTitle, artist, 'mp4', false);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

      this.onProgress(100);
      this.onSubStatus('Successfully Sent to Device');
      this.onComplete();
      recordEmeOutcome('success');
      // keep the finalize caption readable briefly
      setTimeout(() => {
        useRemixStore.getState().setEmePhase(null);
        useRemixStore.getState().setEmeProgress(0);
        useRemixStore.getState().setEmeBytes(null);
      }, 1500);
      return true;
    } catch (err: unknown) {
      const e = err as Error;
      // prevent server fallback after cancel
      if (this.cancelled) {
        recordEmeOutcome('skip', 'cancelled');
        useRemixStore.getState().setEmePhase(null);
        return false;
      }
      // distinguish intentional skips from errors
      const codecSkip = e?.name === 'UnsupportedMuxCodecError';
      recordEmeOutcome(codecSkip ? 'skip' : 'failure', e?.message || 'unknown');
      useRemixStore.getState().setEmePhase(null);
      this.onStatus('initializing');
      this.onLog(
        `${OrchestratorService.getTS()} [System] ${
          codecSkip
            ? 'Source codec not mp4 copy-safe; using Server Turbo'
            : 'Client mux failed; falling back to Server Turbo'
        }: ${e?.message}`
      );
      return false;
    } finally {
      this.muxController = null;
    }
  }
}
