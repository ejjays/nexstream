import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { BACKEND_URL } from '../lib/config';
import { getSanitizedFilename } from '../lib/utils';

const handleSseMessage = (
  data,
  url,
  {
    setStatus,
    setVideoData,
    setIsPickerOpen,
    setPendingSubStatuses,
    setDesktopLogs,
    setTargetProgress,
    setProgress,
    setSubStatus
  }
) => {
  if (data.status) setStatus(data.status);

  if (data.metadata_update) {
    const isSpotify = url.toLowerCase().includes('spotify.com');
    const update = data.metadata_update;
    setVideoData(prev => {
      const wasAlreadyFull = prev?.isPartial === false;
      const isNowFull = update.isFullData === true;
      return {
        ...prev,
        ...update,
        thumbnail:
          update.cover || update.thumbnail || prev?.thumbnail || prev?.cover,
        cover:
          update.cover || update.thumbnail || prev?.cover || prev?.thumbnail,
        isPartial: !wasAlreadyFull && !isNowFull,
        spotifyMetadata: isSpotify
          ? prev?.spotifyMetadata || update || true
          : null
      };
    });
    setTimeout(() => setIsPickerOpen(true), 0);
  }

  if (data.subStatus) {
    if (data.subStatus.startsWith('STREAM ESTABLISHED')) {
      setSubStatus(data.subStatus);
    } else {
      setPendingSubStatuses(prev => [...prev, data.subStatus]);
    }
    setDesktopLogs(prev => [...prev, data.subStatus]);
  }

  if (data.details) setDesktopLogs(prev => [...prev, data.details]);

  if (data.progress !== undefined) {
    setTargetProgress(prev => Math.max(prev, data.progress));
    if (data.progress === 100) {
      setProgress(100);
      setTargetProgress(100);
    }
    if (data.details?.startsWith('BRAIN_LOOKUP_SUCCESS'))
      setProgress(data.progress);
  }
};

const generateUUID = () => {
  if (
    typeof window !== 'undefined' &&
    window.crypto &&
    window.crypto.randomUUID
  ) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const useMediaConverter = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [subStatus, setSubStatus] = useState('');
  const [desktopLogs, setDesktopLogs] = useState([]);
  const [pendingSubStatuses, setPendingSubStatuses] = useState([]);
  const [videoTitle, setVideoTitle] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [isSpotifySession, setIsSpotifySession] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerData, setPlayerData] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const titleRef = useRef('');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (pendingSubStatuses.length === 0) return;

    const nextStatus = pendingSubStatuses[0];

    if (nextStatus.startsWith('RECEIVING DATA:')) {
      setSubStatus(nextStatus);
      setPendingSubStatuses(prev => prev.slice(1));
      return;
    }

    const timer = setTimeout(() => {
      setSubStatus(nextStatus);
      setPendingSubStatuses(prev => prev.slice(1));
    }, 750);

    return () => clearTimeout(timer);
  }, [pendingSubStatuses, subStatus]);

  useEffect(() => {
    if (!loading && status !== 'completed') return;

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= targetProgress) return prev;

        if (targetProgress >= 100) return 100;

        const diff = targetProgress - prev;
        const step = diff > 5 ? diff * 0.15 : 0.2;
        return Math.min(prev + step, targetProgress);
      });
    }, 16);

    return () => clearInterval(interval);
  }, [loading, targetProgress, status]);

  useEffect(() => {
    if (status !== 'fetching_info' && status !== 'initializing') return;

    const interval = setInterval(
      () => {
        setTargetProgress(prev => {
          if (status === 'fetching_info') {
            if (prev >= 90) return prev;
            const increment =
              prev < 50
                ? Math.random() * 0.6 + 0.2
                : Math.random() * 0.2 + 0.05;
            return Math.min(prev + increment, 90);
          }

          if (prev >= 20) return prev;
          return Math.min(prev + 0.2, 20);
        });
      },
      status === 'fetching_info' ? 50 : 80
    );

    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (url.toLowerCase().includes('spotify.com')) {
      setSelectedFormat('mp3');
    }
  }, [url]);

  useEffect(() => {
    if (videoData?.previewUrl && videoData?.title && isPickerOpen) {
      if (!playerData || playerData.previewUrl !== videoData.previewUrl) {
        setPlayerData({
          title: videoData.title,
          artist: videoData.artist,
          imageUrl: videoData.cover,
          previewUrl: videoData.previewUrl
        });
        setShowPlayer(true);
      }
    }
  }, [videoData?.previewUrl, videoData?.title, isPickerOpen, playerData]);

  useEffect(() => {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'SET_REFRESH_ENABLED',
          payload: !isPickerOpen
        })
      );
    }
  }, [isPickerOpen]);

  const handleDownloadTrigger = async (e, overrideUrl) => {
    if (e) e.preventDefault();
    const finalUrl = overrideUrl || url;

    if (!finalUrl) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setProgress(0);
    setTargetProgress(1);

    const isSpotify = finalUrl.toLowerCase().includes('spotify.com');
    setIsSpotifySession(isSpotify);

    if (isSpotify && !finalUrl.toLowerCase().includes('/track/')) {
      setError(
        'Please use a direct Spotify track link. Artist, Album, and Playlist links are not supported.'
      );
      setLoading(false);
      return;
    }

    setStatus('fetching_info');
    setPendingSubStatuses(['Connecting to API network...']);
    setSubStatus('');
    setDesktopLogs(['Connecting to API network...']);
    setVideoTitle('');

    const clientId = generateUUID();

    // CUSTOM SSE READER TO BYPASS NGROK WARNING
    const readSse = async (url, onMessage, onError) => {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'text/event-stream',
            'ngrok-skip-browser-warning': 'true'
          }
        });

        if (!response.ok) throw new Error('SSE connection failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Last partial line

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                onMessage(data);
              } catch (e) {
                console.error('SSE Parse Error:', e);
              }
            }
          }
        }
      } catch (err) {
        console.error('SSE Error:', err);
        onError(err);
      }
    };

    const sseUrl = `${BACKEND_URL}/events?id=${clientId}`;

    readSse(
      sseUrl,
      data => {
        handleSseMessage(data, finalUrl, {
          setStatus,
          setVideoData,
          setIsPickerOpen,
          setPendingSubStatuses,
          setDesktopLogs,
          setTargetProgress,
          setProgress,
          setSubStatus
        });
      },
      err => setError('Progress stream disconnected')
    );

    try {
      await new Promise(r => setTimeout(r, 500));

      const response = await fetch(
        `${BACKEND_URL}/info?url=${encodeURIComponent(
          finalUrl
        )}&id=${clientId}`,
        {
          headers: {
            'ngrok-skip-browser-warning': 'true',
            'bypass-tunnel-reminder': 'true'
          }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch video details');

      const data = await response.json();

      setVideoData(prev => {
        const isFullData = !!(data.formats && data.formats.length > 0);
        return {
          ...prev,
          ...data,
          isPartial: !isFullData,
          previewUrl:
            data.previewUrl ||
            data.spotifyMetadata?.previewUrl ||
            prev?.previewUrl
        };
      });

      if (finalUrl.toLowerCase().includes('spotify.com')) {
        setSelectedFormat('mp3');
        const spotify = data.spotifyMetadata;

        if (spotify && spotify.previewUrl && !playerData) {
          setPlayerData({
            title: spotify.title,
            artist: spotify.artist,
            imageUrl: spotify.cover || spotify.imageUrl || data.cover,
            previewUrl: spotify.previewUrl
          });
          setShowPlayer(true);
        }
      }

      setTargetProgress(90);
      if (data.spotifyMetadata?.fromBrain) setProgress(90);

      setIsPickerOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      eventSource.close();
    }
  };

  const handleDownload = async (formatId, metadataOverrides = {}) => {
    if (loading && status === 'downloading') return;

    setIsPickerOpen(false);
    setLoading(true);
    setError('');
    setStatus('initializing');
    setTargetProgress(95);
    setPendingSubStatuses(['Preparing background tasks...']);
    setSubStatus('');
    setDesktopLogs([]);

    setTargetProgress(prev => Math.max(prev, 95));

    const finalTitle = metadataOverrides.title || videoData?.title || '';
    setVideoTitle(finalTitle);
    titleRef.current = finalTitle;

    const clientId = generateUUID();

    const readSse = async (url, onMessage, onError) => {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'text/event-stream',
            'ngrok-skip-browser-warning': 'true'
          }
        });
        if (!response.ok) throw new Error('SSE connection failed');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                onMessage(data);
              } catch (e) {
                console.error(e);
              }
            }
          }
        }
      } catch (err) {
        onError(err);
      }
    };

    readSse(
      `${BACKEND_URL}/events?id=${clientId}`,
      data => {
        if (data.status === 'error') {
          setError(data.message);
          setLoading(false);
          return;
        }

        if (data.status) setStatus(data.status);

        if (data.subStatus) {
          const isStreamEstablished =
            data.subStatus.startsWith('STREAM ESTABLISHED');
          if (isStreamEstablished) {
            setSubStatus(data.subStatus);
            setProgress(100);
            setTargetProgress(100);
          } else {
            setPendingSubStatuses(prev => [...prev, data.subStatus]);
          }
          setDesktopLogs(prev => [...prev, data.subStatus]);
        }

        if (data.details) setDesktopLogs(prev => [...prev, data.details]);

        if (data.progress !== undefined) {
          const newProgress = Math.max(targetProgress, data.progress);
          setTargetProgress(newProgress);
          if (data.progress === 100) {
            setProgress(100);
            setTargetProgress(100);
          }
        }

        if (data.title && !metadataOverrides.title) {
          setVideoTitle(data.title);
          titleRef.current = data.title;
        }

        if (data.status === 'downloading' && data.progress === 100) {
          setProgress(100);
          setTargetProgress(100);
          setTimeout(() => {
            setLoading(false);
            setStatus('completed');
          }, 800);
        }
      },
      err => console.error('SSE Error during download:', err)
    );

    try {
      console.log('DEBUG: handleDownload initiated for ' + formatId);

      if (!url.toLowerCase().includes('mp3') && selectedFormat !== 'mp3') {
        await new Promise(r => setTimeout(r, 200));
      }

      const selectedOption = (
        selectedFormat === 'mp4' ? videoData?.formats : videoData?.audioFormats
      )?.find(f => f.format_id === formatId);

      const finalFormatParam =
        selectedOption?.extension ||
        (formatId === 'mp3' ? 'mp3' : selectedFormat);

      const queryParams = new URLSearchParams({
        url: url,
        id: clientId,
        format: finalFormatParam,
        formatId: formatId,
        filesize: selectedOption?.filesize || '',
        title: finalTitle,
        artist: metadataOverrides.artist || videoData?.artist || '',
        album: metadataOverrides.album || videoData?.album || '',
        year: videoData?.spotifyMetadata?.year || '',
        targetUrl: videoData?.spotifyMetadata?.targetUrl || ''
      });

      const downloadUrlWithParams = `${BACKEND_URL}/convert?${queryParams.toString()}`;

      if (window.ReactNativeWebView) {
        console.log('DEBUG: Triggering Mobile Bridge...');
        try {
          const fileName = getSanitizedFilename(
            finalTitle || 'video',
            metadataOverrides.artist || videoData?.artist || '',
            finalFormatParam,
            url.includes('spotify.com')
          );

          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: 'DOWNLOAD_FILE',

              payload: {
                url: downloadUrlWithParams,
                fileName: fileName,
                mimeType:
                  finalFormatParam === 'mp3' ? 'audio/mpeg' : 'video/mp4'
              }
            })
          );
          console.log('DEBUG: Bridge Message Sent');
        } catch (bridgeError) {
          console.error(
            'CRITICAL: Bridge Execution Failed: ' + bridgeError.message
          );
        }
        return;
      }

      const downloadResponse = await fetch(`${BACKEND_URL}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'ngrok-skip-browser-warning': 'true'
        },
        body: queryParams.toString()
      });

      if (!downloadResponse.ok) throw new Error('Download request failed');

      const blob = await downloadResponse.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = getSanitizedFilename(
        finalTitle || 'video',
        metadataOverrides.artist || videoData?.artist || '',
        finalFormatParam,
        url.includes('spotify.com')
      );
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);

      setTargetProgress(100);

      if (finalFormatParam === 'mp3') {
        setTimeout(() => {
          setLoading(false);
          setStatus('completed');
        }, 1500);
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
      setLoading(false);
    }
  };

  useLayoutEffect(() => {
    window.onNativePaste = text => {
      if (text) setUrl(text);
    };

    window.onDownloadProgress = percentage => {
      if (percentage !== undefined) {
        setProgress(percentage);
        setTargetProgress(percentage);
        if (percentage === 100) {
          setTimeout(() => {
            setLoading(false);
            setStatus('completed');
          }, 1000);
        }
      }
    };

    window.onNativeRefresh = () => {
      setUrl('');
      setLoading(false);
      setError('');
      setProgress(0);
      setTargetProgress(0);
      setStatus('');
      setSubStatus('');
      setDesktopLogs([]);
      setPendingSubStatuses([]);
      setVideoTitle('');
      setIsPickerOpen(false);
      setVideoData(null);
      setIsSpotifySession(false);
      setShowPlayer(false);
      setPlayerData(null);
    };

    return () => {};
  }, []);

  const handlePaste = async () => {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: 'REQUEST_CLIPBOARD'
        })
      );
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  };

  return {
    url,
    setUrl,
    loading,
    error,
    progress,
    status,
    subStatus,
    desktopLogs,
    videoTitle,
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
    handleDownloadTrigger,
    handleDownload,
    handlePaste
  };
};
