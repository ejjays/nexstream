import { useCallback, useMemo } from 'react';
import { useRemixStore } from '../store/useRemixStore';
import { useProgress } from './useProgress';
import { OrchestratorService } from '../lib/orchestrator.service';

export interface MetadataOverrides {
  title?: string;
  artist?: string;
  album?: string;
  extension?: string;
}

export const useDownloadOrchestrator = () => {
  const url = useRemixStore((state) => state.url);
  const clientId = useRemixStore((state) => state.clientId);
  const loading = useRemixStore((state) => state.loading);
  const setLoading = useRemixStore((state) => state.setLoading);
  const error = useRemixStore((state) => state.error);
  const setError = useRemixStore((state) => state.setError);
  const status = useRemixStore((state) => state.status);
  const setStatus = useRemixStore((state) => state.setStatus);
  const setSubStatus = useRemixStore((state) => state.setSubStatus);
  const setProgress = useRemixStore((state) => state.setProgress);
  const setTargetProgress = useRemixStore((state) => state.setTargetProgress);
  const setPendingSubStatuses = useRemixStore((state) => state.setPendingSubStatuses);
  const setDesktopLogs = useRemixStore((state) => state.setDesktopLogs);
  const selectedFormat = useRemixStore((state) => state.selectedFormat);
  const videoData = useRemixStore((state) => state.videoData) as any;
  const setVideoTitle = useRemixStore((state) => state.setVideoTitle);
  const setIsPickerOpen = useRemixStore((state) => state.setIsPickerOpen);
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // init service
  const service = useMemo(() => new OrchestratorService({
    onStatus: (s: string) => setStatus(s),
    onProgress: (p: number) => setTargetProgress(p),
    onSubStatus: (s: string) => {
      if (s.startsWith('STREAM ESTABLISHED')) {
        setSubStatus(s);
        setProgress(100);
        setTargetProgress(100);
      } else {
        setPendingSubStatuses((prev: any) => [...prev, s]);
      }
    },
    onLog: (msg: string) => setDesktopLogs((prev: any) => [...prev, msg]),
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
    }
  }), [setStatus, setTargetProgress, setSubStatus, setProgress, setPendingSubStatuses, setDesktopLogs, setError, setLoading]);

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
      )?.find((f: any) => String(f.format_id) === formatId);
      const targetUrl = videoData?.targetUrl ?? videoData?.target_url ?? videoData?.spotifyMetadata?.targetUrl ?? '';

      // check EME
      const isAudioOnly = selectedFormat === 'mp3' || selectedFormat === 'm4a';
      const isEMECompatible = 
        isAudioOnly &&
        typeof window !== 'undefined' && 
        'storage' in navigator && 
        'getDirectory' in navigator.storage &&
        'serviceWorker' in navigator &&
        navigator.serviceWorker.controller !== null;

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
          backendUrl
        } as any);
      }

      if (!emeSuccess) {
        // fallback turbo
        await service.startServerDownload({
          url, 
          finalTitle, 
          artist, 
          selectedOption, 
          formatId, 
          serverClientId: clientId, 
          targetUrl, 
          selectedFormat, 
          backendUrl
        } as any);
      }
    },
    [loading, status, videoData, selectedFormat, url, clientId, setIsPickerOpen, setLoading, setError, setStatus, setTargetProgress, setProgress, setSubStatus, setPendingSubStatuses, setVideoTitle, service, backendUrl]
  );

  return { startDownload };
};
