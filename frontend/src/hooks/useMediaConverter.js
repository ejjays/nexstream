import { useState, useCallback, useMemo, useEffect } from 'react';
import { useProgress } from './useProgress';
import { useSSE } from './useSSE';
import { useNativeBridge } from './useNativeBridge';
import { useVideoInfo } from './useVideoInfo';
import { useDownloadOrchestrator } from './useDownloadOrchestrator';

export const useMediaConverter = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videoData, setVideoData] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerData, setPlayerData] = useState(null);
  const [videoTitle, setVideoTitle] = useState('');

  const {
    progress,
    targetProgress,
    status,
    subStatus,
    pendingSubStatuses,
    desktopLogs,
    setProgress,
    setTargetProgress,
    setStatus,
    setSubStatus,
    setPendingSubStatuses,
    setDesktopLogs
  } = useProgress();

  const { readSse, disconnect } = useSSE();

  const isSpotifySession =
    typeof url === 'string' && url.toLowerCase().includes('spotify.com');

  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const generateUUID = useCallback(
    () => (typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 15)),
    []
  );

  const bridgeProps = useMemo(
    () => ({
      setUrl: val => {
        if (typeof val === 'string') setUrl(val);
      },
      setLoading,
      setError,
      setProgress,
      setTargetProgress,
      setStatus,
      setSubStatus,
      setDesktopLogs,
      setPendingSubStatuses,
      setVideoTitle,
      setIsPickerOpen,
      setVideoData,
      setShowPlayer,
      setPlayerData,
      isPickerOpen
    }),
    [
      isPickerOpen,
      setLoading,
      setError,
      setProgress,
      setTargetProgress,
      setStatus,
      setSubStatus,
      setDesktopLogs,
      setPendingSubStatuses,
      setVideoTitle,
      setIsPickerOpen,
      setVideoData,
      setShowPlayer,
      setPlayerData
    ]
  );

  const { triggerMobileDownload, requestClipboard } = useNativeBridge(bridgeProps);

  const { fetchInfo } = useVideoInfo({
    url,
    readSse,
    setLoading,
    setError,
    setVideoData,
    setIsPickerOpen,
    setStatus,
    setTargetProgress,
    setProgress,
    setSubStatus,
    setPendingSubStatuses,
    setDesktopLogs,
    setSelectedFormat,
    setPlayerData,
    setShowPlayer,
    generateUUID
  });

  const { startDownload } = useDownloadOrchestrator({
    url,
    videoData,
    selectedFormat,
    loading,
    status,
    readSse,
    disconnect,
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
  });

  const handlePaste = useCallback(
    async input => {
      const pastedVal = input && typeof input === 'string' ? input : '';
      if (pastedVal) {
        setUrl(pastedVal);
        await fetchInfo(pastedVal);
      }
    },
    [fetchInfo]
  );

  return {
    url,
    setUrl,
    loading,
    error,
    progress,
    targetProgress,
    status,
    subStatus,
    pendingSubStatuses,
    desktopLogs,
    selectedFormat,
    setSelectedFormat,
    isPickerOpen,
    setIsPickerOpen,
    videoData,
    showPlayer,
    setShowPlayer,
    playerData,
    isMobile,
    isSpotifySession,
    handleDownloadTrigger: fetchInfo,
    handleDownload: startDownload,
    handlePaste,
    requestClipboard
  };
};
