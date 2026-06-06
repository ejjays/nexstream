import { useCallback, useMemo } from 'react';
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

// opfs + sw required for edge muxing
function isEdgeMuxingSupported(isAudioOnly: boolean): boolean {
  return (
    isAudioOnly &&
    typeof window !== 'undefined' &&
    'storage' in navigator &&
    'getDirectory' in navigator.storage &&
    'serviceWorker' in navigator &&
    navigator.serviceWorker.controller !== null
  );
}

export const useDownloadOrchestrator = () => {
  const url = useRemixStore((state) => state.url);
  const videoData = useRemixStore((state) => state.videoData) as
    | VideoData
    | undefined;
  const selectedFormat = useRemixStore((state) => state.selectedFormat);
  const loading = useRemixStore((state) => state.loading);
  const status = useRemixStore((state) => state.status);
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
  const setLoading = useRemixStore((state) => state.setLoading);
  const setError = useRemixStore((state) => state.setError);
  const setVideoTitle = useRemixStore((state) => state.setVideoTitle);

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
      if (loading && status === 'downloading') return;
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

      // check eme
      const isAudioOnly = selectedFormat === 'mp3' || selectedFormat === 'm4a';
      const isEMECompatible = isEdgeMuxingSupported(isAudioOnly);

      let emeSuccess = false;
      if (isEMECompatible) {
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
      loading,
      status,
      videoData,
      selectedFormat,
      url,
      clientId,
      setIsPickerOpen,
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
