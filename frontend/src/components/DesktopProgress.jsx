import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
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
  const [showSuccess, setShowSuccess] = useState(false);
  const scrollRef = useRef(null);
  const isAutoScrollPinnedRef = useRef(true);

  // human readable text
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

  // format for terminal
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

  // map logs directly
  const displayLogs = (desktopLogs || []).map((log, i) => {
    // extract timestamp from log string
    const match = log.match(/^(\[\d+:\d{2}\])\s*(.*)/);
    return {
      id: `log-${i}`,
      text: formatLogForDisplay(match ? match[2] : log),
      timestamp: match ? match[1] : '',
      type: log.includes('SYSTEM_ALERT') ? 'error' : 'info'
    };
  }).filter(l => l.text);

  // handle success state
  useEffect(() => {
    if (status === 'completed') {
      setShowSuccess(true);
    } else if (status !== 'idle' && (loading || isPickerOpen)) {
      setShowSuccess(false);
    }
  }, [status, loading, isPickerOpen]);

  // auto scroll terminal
  useEffect(() => {
    if (scrollRef.current && isAutoScrollPinnedRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayLogs, showSuccess]);

  // track scroll position
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;
      isAutoScrollPinnedRef.current = isAtBottom;
    }
  };

  // compute status text
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
        if (subStatus?.includes('Booting')) return 'EME_LOAD_WASM';
        if (subStatus?.includes('Negotiating')) return 'EME_HANDSHAKE';
        if (subStatus?.includes('Video Buffer')) return 'EME_FETCH_VIDEO';
        if (subStatus?.includes('Audio Buffer')) return 'EME_FETCH_AUDIO';
        if (subStatus?.includes('Interleaving')) return 'EME_STITCHING';
        if (subStatus?.includes('Success')) return 'EME_COMPLETED';
        return 'EME_PROCESSING';
      default:
        return 'SYSTEM_IDLE';
    }
  };

  // visibility check
  const isVisible = status !== 'idle' || loading || error || isPickerOpen;

  return (
    <TerminalView
      isVisible={isVisible}
      progress={progress}
      statusText={getStatusText()}
      displayLogs={displayLogs}
      showSuccess={showSuccess}
      getTimestamp={() => ''}
      scrollRef={scrollRef}
      handleScroll={handleScroll}
      error={error}
      isPickerOpen={isPickerOpen}
    />
  );
};

DesktopProgress.propTypes = {
  loading: PropTypes.bool,
  progress: PropTypes.number,
  status: PropTypes.string,
  subStatus: PropTypes.string,
  desktopLogs: PropTypes.array,
  selectedFormat: PropTypes.string,
  error: PropTypes.string,
  isPickerOpen: PropTypes.bool
};

export default DesktopProgress;
