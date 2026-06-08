import { useCallback, useMemo, useRef } from 'react';
import { useRemixStore } from '../store/useRemixStore';
import { OrchestratorService } from '../lib/orchestrator.service';

interface Format {
  formatId: string | number;
  [key: string]: string | number | boolean | undefined;
}

interface SpotifyMetadata {
  targetUrl?: string;
}

interface VideoData {
  title?: string;
  artist?: string;
  formats: Format[];
  audioFormats: Format[];
  targetUrl?: string;
  spotifyMetadata?: SpotifyMetadata;
}

type MetadataOverrides = {
  title?: string;
  artist?: string;
  extension?: string;
};

export const useDownloadOrchestrator = () => {
  const url = useRemixStore((state) => state.url);
  const videoData = useRemixStore((state) => state.videoData) as
    | VideoData
    | undefined;
  const selectedFormat = useRemixStore((state) => state.selectedFormat);
  const backendUrl = useRemixStore((state) => state.backendUrl);
  const clientId = useRemixStore((state) => state.clientId);

  const setStatus = useRemixStore((state) => state.setStatus);
  const setTargetProgress = useRemixStore((state) => state.setTargetProgress);
  const setProgress = useRemixStore((state) => state.setProgress);
  const setSubStatus = useRemixStore((state) => state.setSubStatus);
  const setPendingSubStatuses = useRemixStore(
    (state) => state.setPendingSubStatuses
  );
  const setDesktopLogs = useRemixStore((state) => state.setDesktopLogs);
  const setIsPickerOpen = useRemixStore((state) => state.setIsPickerOpen);
  const setDownloadStarted = useRemixStore((state) => state.setDownloadStarted);
  const setLoading = useRemixStore((state) => state.setLoading);
  const setError = useRemixStore((state) => state.setError);
  const setVideoTitle = useRemixStore((state) => state.setVideoTitle);

  // debounce the picker double-submit bug
  const lastDownloadRef = useRef(0);

  // init service
  const service = useMemo(
    () =>
      new OrchestratorService({
        onStatus: (s: string) => setStatus(s),
        onProgress: (progressVal: number) => setTargetProgress(progressVal),
        onSubStatus: (s: string) => {
          if (s.startsWith('STREAM ESTABLISHED')) {
            setSubStatus(s);
            setProgress(100);
            setTargetProgress(100);
          } else {
            setPendingSubStatuses((prev: string[]) => [...prev, s]);
          }
        },
        onLog: (msg: string) =>
          setDesktopLogs((prev: string[]) => [...prev, msg].slice(-500)),
        onError: (err: unknown): void => {
          if (err instanceof Error) {
            setError(err.message);
          } else {
            setError(String(err));
          }
          setLoading(false);
        },
        onComplete: () => {
          setProgress(100);
          setTargetProgress(100);
          setTimeout(() => {
            setLoading(false);
            setStatus('completed');
          }, 1500);
        },
      }),
    [
      setStatus,
      setTargetProgress,
      setSubStatus,
      setProgress,
      setPendingSubStatuses,
      setDesktopLogs,
      setError,
      setLoading,
    ]
  );

  const startDownload = useCallback(
    async (formatId: string, metadataOverrides: MetadataOverrides = {}) => {
      // ignore re-fire within 2s window
      const now = Date.now();
      if (now - lastDownloadRef.current < 2000) return;
      lastDownloadRef.current = now;
      setDownloadStarted(true);
      setIsPickerOpen(false);
      setLoading(true);
      setError('');
      setStatus('initializing');
      setTargetProgress(5);
      setPendingSubStatuses(['Resolving High-Speed Stream Manifests...']);
      setSubStatus('');

      const finalTitle = metadataOverrides.title ?? videoData?.title ?? '';
      const artist = metadataOverrides.artist ?? videoData?.artist ?? '';
      setVideoTitle(finalTitle);

      // setup engine
      const selectedOption = (
        selectedFormat === 'mp4' ? videoData?.formats : videoData?.audioFormats
      )?.find((f: Format) => String(f.formatId) === formatId);

      const targetUrl =
        videoData?.targetUrl ??
        videoData?.targetUrl ??
        videoData?.spotifyMetadata?.targetUrl ??
        '';

      // try client mux first for video
      let emeSuccess = false;
      if (selectedFormat === 'mp4') {
        emeSuccess = await service.startEdgeMuxing({
          url,
          clientId,
          formatId,
          targetUrl,
          videoData,
          selectedFormat,
          finalTitle,
          artist,
          backendUrl,
        });
      }

      if (!emeSuccess) {
        // fallback turbo
        let directSuccess = false;
        if (selectedFormat === 'mp4') {
          directSuccess = await service.startDirectDownload({
            url,
            finalTitle,
            artist,
            selectedOption,
            formatId,
            clientId,
            backendUrl,
          });
        }

        if (!directSuccess) {
          await service.startServerDownload({
            url,
            finalTitle,
            artist,
            selectedOption,
            formatId,
            serverClientId: clientId,
            targetUrl,
            selectedFormat,
            backendUrl,
          });
        }
      }
    },
    [
      videoData,
      selectedFormat,
      url,
      clientId,
      setIsPickerOpen,
      setDownloadStarted,
      setLoading,
      setError,
      setStatus,
      setTargetProgress,
      setSubStatus,
      setPendingSubStatuses,
      setVideoTitle,
      service,
      backendUrl,
    ]
  );

  return { startDownload };
};
