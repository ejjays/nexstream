import { useCallback, useMemo } from 'react';
import { OrchestratorService } from '../lib/orchestrator.service';

export const useDownloadOrchestrator = ({
  url,
  videoData,
  selectedFormat,
  loading,
  status,
  readSse,
  generateUUID,
  triggerMobileDownload,
  setIsPickerOpen,
  setLoading,
  setError,
  setStatus,
  setTargetProgress,
  setProgress,
  setSubStatus,
  setPendingSubStatuses,
  setDesktopLogs,
  setVideoTitle
}) => {
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
      setLoading(false);
      setStatus('completed');
    }
  }), [setStatus, setTargetProgress, setSubStatus, setProgress, setPendingSubStatuses, setDesktopLogs, setError, setLoading]);

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
      setDesktopLogs([]);

      const finalTitle = metadataOverrides.title || videoData?.title || '';
      const artist = metadataOverrides.artist || videoData?.artist || '';
      setVideoTitle(finalTitle);

      const selectedOption = (
        selectedFormat === 'mp4' ? videoData?.formats : videoData?.audioFormats
      )?.find(f => String(f.format_id) === String(formatId));

      const clientId = generateUUID();
      const targetUrl = videoData?.targetUrl || videoData?.spotifyMetadata?.targetUrl || '';
      const isSpotify = url.toLowerCase().includes('spotify.com');

      // edge muxing
      let success = false;
      if (!isSpotify) {
        success = await service.startEdgeMuxing({
          url, clientId, formatId, targetUrl, videoData, selectedFormat, finalTitle, artist, generateUUID, triggerMobileDownload
        });
      }

      // fallback server turbo
      if (!success) {
        const serverClientId = generateUUID();
        await service.startServerDownload({
          url, finalTitle, artist, selectedOption, formatId, serverClientId, targetUrl, selectedFormat, readSse, triggerMobileDownload
        });
      }
    },
    [loading, status, videoData, selectedFormat, url, generateUUID, triggerMobileDownload, setIsPickerOpen, setLoading, setError, setStatus, setTargetProgress, setProgress, setSubStatus, setPendingSubStatuses, setDesktopLogs, setVideoTitle, service, readSse]
  );

  return { startDownload };
};
