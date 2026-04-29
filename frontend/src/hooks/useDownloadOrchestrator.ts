// @ts-nocheck
import { useCallback, useMemo } from 'react';
import { useRemixStore } from '../store/useRemixStore';
import { OrchestratorService } from '../lib/orchestrator.service';

export const useDownloadOrchestrator = () => {
  const url = useRemixStore((state) => state.url);
  const videoData = useRemixStore((state) => state.videoData);
  const selectedFormat = useRemixStore((state) => state.selectedFormat);
  const loading = useRemixStore((state) => state.loading);
  const status = useRemixStore((state) => state.status);
  const backendUrl = useRemixStore((state) => state.backendUrl);
  const clientId = useRemixStore((state) => state.clientId);
  
  const setStatus = useRemixStore((state) => state.setStatus);
  const setTargetProgress = useRemixStore((state) => state.setTargetProgress);
  const setProgress = useRemixStore((state) => state.setProgress);
  const setSubStatus = useRemixStore((state) => state.setSubStatus);
  const setPendingSubStatuses = useRemixStore((state) => state.setPendingSubStatuses);
  const setDesktopLogs = useRemixStore((state) => state.setDesktopLogs);
  const setIsPickerOpen = useRemixStore((state) => state.setIsPickerOpen);
  const setLoading = useRemixStore((state) => state.setLoading);
  const setError = useRemixStore((state) => state.setError);
  const setVideoTitle = useRemixStore((state) => state.setVideoTitle);

  // init service
  const service = useMemo(() => new OrchestratorService({
    onStatus: (s) => setStatus(s),
    onProgress: (p) => setTargetProgress(p),
    onSubStatus: (s) => {
      if (s.startsWith('STREAM ESTABLISHED')) {
        setSubStatus(s);
        setProgress(100);
        setTargetProgress(100);
      } else {
        setPendingSubStatuses(prev => [...prev, s]);
      }
    },
    onLog: (msg) => setDesktopLogs(prev => [...prev, msg]),
    onError: (err) => {
      setError(err);
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
  }), [setStatus, setTargetProgress, setSubStatus, setProgress, setPendingSubStatuses, setDesktopLogs, setError, setLoading, setStatus]);

  const startDownload = useCallback(
    async (formatId, metadataOverrides = {}) => {
      if (loading && status === 'downloading') return;
      setIsPickerOpen(false);
      setLoading(true);
      setError('');
      setStatus('initializing');
      setTargetProgress(5);
      setPendingSubStatuses(['Resolving High-Speed Stream Manifests...']);
      setSubStatus('');

      const finalTitle = metadataOverrides.title || videoData?.title || '';
      const artist = metadataOverrides.artist || videoData?.artist || '';
      setVideoTitle(finalTitle);

      // setup engine
      const selectedOption = (
        selectedFormat === 'mp4' ? videoData?.formats : videoData?.audioFormats
      )?.find(f => String(f.format_id) === String(formatId));

      const targetUrl = videoData?.targetUrl || videoData?.target_url || videoData?.spotifyMetadata?.targetUrl || '';

      // trigger server mux
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
      });
    },
    [loading, status, videoData, selectedFormat, url, clientId, setIsPickerOpen, setLoading, setError, setStatus, setTargetProgress, setProgress, setSubStatus, setPendingSubStatuses, setDesktopLogs, setVideoTitle, service, backendUrl]
  );

  return { startDownload };
};
