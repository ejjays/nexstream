import { useState, useEffect, useRef, useCallback } from 'react';
import TerminalView from './terminal/TerminalView.jsx';

const DesktopProgress = ({
  loading,
  progress,
  status,
  subStatus,
  desktopLogs = [],
  selectedFormat,
  error,
  isPickerOpen
}) => {
  const [displayLogs, setDisplayLogs] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const queueRef = useRef([]);
  const isProcessingRef = useRef(false);
  const lastPrintedLogRef = useRef('');
  const processedCountRef = useRef(0);
  const startTimeRef = useRef(null);
  const scrollRef = useRef(null);
  const isAutoScrollPinnedRef = useRef(true);

  const humanize = useCallback(text => {
    if (!text) return '';
    if (text.includes('ISRC_IDENTIFIED:')) {
      const isrc = text.split('ISRC_IDENTIFIED:')[1].trim();
      return `FINGERPRINT: ${isrc}`;
    }

    let cleaned = text
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();

    cleaned = cleaned
      .replace(/\bApi\b/g, 'API')
      .replace(/\bIsrc\b/g, 'ISRC')
      .replace(/\bTls\b/g, 'TLS')
      .replace(/\bSse\b/g, 'SSE')
      .replace(/\bYoutube\b/g, 'YouTube')
      .replace(/\bSpotify\b/g, 'Spotify')
      .replace(/\bId\b/g, 'ID')
      .replace(/\bAi\b/g, 'AI')
      .replace(/\bCdn\b/g, 'CDN')
      .replace(/\bDns\b/g, 'DNS')
      .replace(/\bMuxer\b/g, 'MUXER')
      .replace(/\bHttp\b/g, 'HTTP');

    return cleaned;
  }, []);

  const formatLogForDisplay = useCallback(
    text => {
      if (!text) return '';
      if (text.toUpperCase().includes('ISRC_IDENTIFIED:')) {
        const isrc = text.split(/:/)[1].trim();
        return `FINGERPRINT: ${isrc}`;
      }
      const withoutPrefix = text.replace(/^[A-Za-z0-9_\-\s]+:\s*/, '');
      return humanize(withoutPrefix);
    },
    [humanize]
  );

  const getTimestamp = useCallback(() => {
    if (!startTimeRef.current) return '[0:00]';
    const elapsedMs = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const mins = Math.floor(elapsedMs / 60);
    const secs = elapsedMs % 60;
    return `[${mins}:${secs.toString().padStart(2, '0')}]`;
  }, []);

  function processNext() {
    if (queueRef.current.length === 0) {
      isProcessingRef.current = false;
      return;
    }
    isProcessingRef.current = true;
    const rawLog = queueRef.current.shift();
    const formatted = formatLogForDisplay(rawLog);

    if (formatted && formatted !== lastPrintedLogRef.current) {
      lastPrintedLogRef.current = formatted;

      setDisplayLogs(prev =>
        [
          ...prev,
          {
            id: `${Date.now()}-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substr(2, 9)}`,
            text: formatted,
            timestamp: getTimestamp(),
            type: rawLog.includes('SYSTEM_ALERT') ? 'error' : 'info'
          }
        ].slice(-100)
      );

      setTimeout(processNext, 450);
    } else {
      processNext();
    }
  }

  const handleActiveProcessing = useCallback(() => {
    setShowSuccess(false);
    if (!startTimeRef.current) startTimeRef.current = Date.now();

    if (desktopLogs.length === 0 && processedCountRef.current > 0) {
      processedCountRef.current = 0;
      lastPrintedLogRef.current = '';
      return;
    }

    if (desktopLogs.length > processedCountRef.current) {
      const newRawLogs = desktopLogs.slice(processedCountRef.current);
      queueRef.current = [...queueRef.current, ...newRawLogs];
      processedCountRef.current = desktopLogs.length;
      if (!isProcessingRef.current) processNext();
    }
  }, [desktopLogs]);

  const handleStatusReset = useCallback(() => {
    setDisplayLogs([]);
    queueRef.current = [];
    isProcessingRef.current = false;
    lastPrintedLogRef.current = '';
    processedCountRef.current = 0;
    startTimeRef.current = null;
    isAutoScrollPinnedRef.current = true;
    setShowSuccess(false);
  }, []);

  const handleSuccessState = useCallback(() => {
    if (!showSuccess) {
      setShowSuccess(true);
      setDisplayLogs([]);
      queueRef.current = [];
      isProcessingRef.current = false;
    }
  }, [showSuccess]);

  const handleErrorState = useCallback(errorMsg => {
    setShowSuccess(false);
    const fullMsg = `SYSTEM_ALERT: ${errorMsg.toUpperCase()}`;
    if (lastPrintedLogRef.current !== fullMsg) {
      queueRef.current.push(fullMsg);
      if (!isProcessingRef.current) processNext();
    }
  }, []);

  useEffect(() => {
    const isActivelyProcessing =
      loading ||
      isPickerOpen ||
      [
        'fetching_info',
        'initializing',
        'downloading',
        'merging',
        'sending',
        'eme_initializing',
        'eme_downloading'
      ].includes(status);

    if (isActivelyProcessing) {
      handleActiveProcessing();
    } else if (status === 'completed') {
      handleSuccessState();
    } else if (error) {
      handleErrorState(error);
    } else if (!loading && !status && !error && !isPickerOpen) {
      handleStatusReset();
    }
  }, [
    loading,
    isPickerOpen,
    status,
    error,
    handleActiveProcessing,
    handleSuccessState,
    handleErrorState,
    handleStatusReset
  ]);

  useEffect(() => {
    if (scrollRef.current && isAutoScrollPinnedRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayLogs, showSuccess]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;
      isAutoScrollPinnedRef.current = isAtBottom;
    }
  };

  const getStatusText = () => {
    if (error) return 'SYSTEM_FAILURE';
    if (status === 'completed') return 'TASK_COMPLETED';
    if (isPickerOpen) return 'AWAITING_SELECTION';
    const formatName = selectedFormat === 'mp4' ? 'VIDEO' : 'AUDIO';

    switch (status) {
      case 'fetching_info':
        return `ANALYZING_${formatName}`;
      case 'initializing':
        return 'BOOTING_CORE';
      case 'downloading':
        return 'EXTRACTING_STREAM';
      case 'merging':
        return 'COMPILING_ASSETS';
      case 'sending':
        return 'BUFFERING_TO_CLIENT';
      case 'eme_initializing':
        return 'EME_BOOTING_CORE';
      case 'eme_downloading':
        if (subStatus?.includes('Loading LibAV Core'))
          return 'EME_LOADING_CORE';
        if (subStatus?.includes('Downloading Video'))
          return 'EME_DOWNLOADING_VIDEO';
        if (subStatus?.includes('Downloading Audio'))
          return 'EME_DOWNLOADING_AUDIO';
        if (subStatus?.includes('Stitching Streams'))
          return 'EME_COMPILING_ASSETS';
        if (subStatus?.includes('Finalizing'))
          return 'EME_FINALIZING';
        return 'EME_PROCESSING'; 
      default:
        return 'SYSTEM_IDLE';
    }
  };

  const isVisible = loading || status === 'completed' || error || isPickerOpen;

  return (
    <TerminalView
      isVisible={isVisible}
      progress={progress}
      statusText={getStatusText()}
      displayLogs={displayLogs}
      showSuccess={showSuccess}
      getTimestamp={getTimestamp}
      scrollRef={scrollRef}
      handleScroll={handleScroll}
      error={error}
      isPickerOpen={isPickerOpen}
    />
  );
};

export default DesktopProgress;
