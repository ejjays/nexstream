import { useState, useRef, useCallback, useMemo } from 'react';
import { BACKEND_URL } from '../lib/config';
import { getSanitizedFilename } from '../lib/utils';
import { useProgress } from './useProgress';
import { useSSE, handleSseMessage } from './useSSE';
import { useNativeBridge } from './useNativeBridge';
import { muxVideoAudio } from '../lib/muxer';

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
  const titleRef = useRef('');

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

  const { readSse } = useSSE();

  const isSpotifySession =
    typeof url === 'string' && url.toLowerCase().includes('spotify.com');

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

  const { triggerMobileDownload, requestClipboard } =
    useNativeBridge(bridgeProps);

  const runServerSideDownload = useCallback(
    async (params) => {
      const { finalTitle, artist, selectedOption, formatId, serverClientId } = params;
      
      setTargetProgress(10);
      setPendingSubStatuses(['Connecting to Cloud Orchestrator...']);
      setDesktopLogs(prev => [...prev, '[System] Using Server-Side Turbo Engine...']);

      readSse(`${BACKEND_URL}/events?id=${serverClientId}`, data => {
        if (data.status === 'error') {
          setError(data.message);
          setLoading(false);
          return;
        }
        if (data.status) setStatus(data.status);
        if (data.subStatus) {
          if (data.subStatus.startsWith('STREAM ESTABLISHED')) {
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
          setTargetProgress(prev => Math.max(prev, data.progress));
          if (data.progress === 100) {
            setProgress(100);
            setTargetProgress(100);
          }
        }
        if (data.status === 'downloading' && data.progress === 100) {
          setProgress(100);
          setTargetProgress(100);
          setTimeout(() => {
            setLoading(false);
            setStatus('completed');
          }, 800);
        }
      });

      try {
        const finalFormatParam =
          selectedFormat === 'mp4'
            ? selectedOption?.format_id
            : selectedOption?.extension || selectedFormat;

        const finalFormatId = selectedOption?.format_id || formatId;

        const downloadUrl = `${BACKEND_URL}/convert?url=${encodeURIComponent(
          url
        )}&format=${finalFormatParam}&formatId=${finalFormatId}&targetUrl=${encodeURIComponent(
          videoData?.targetUrl || videoData?.spotifyMetadata?.targetUrl || ''
        )}&id=${serverClientId}&title=${encodeURIComponent(
          finalTitle
        )}&artist=${encodeURIComponent(artist)}`;

        const fileName = getSanitizedFilename(
          finalTitle,
          artist,
          finalFormatParam,
          url.includes('spotify.com')
        );

        const wasTriggered = triggerMobileDownload({
          url: downloadUrl,
          fileName
        });

        if (!wasTriggered) {
          globalThis.location.href = downloadUrl;
          setDesktopLogs(prev => [
            ...prev,
            `[System] Handshake Established. Triggering Browser Save...`
          ]);
          setSubStatus('TRANSFERRING_TO_BROWSER');
        }
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    },
    [url, videoData, selectedFormat, readSse, setStatus, setTargetProgress, setProgress, setSubStatus, setPendingSubStatuses, setDesktopLogs, setError, setLoading, triggerMobileDownload]
  );

  const isMobile =
    typeof globalThis !== 'undefined' &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const generateUUID = useCallback(
    () => (typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 15)),
    []
  );

  const reportEME = useCallback(async (event, data = {}, clientId) => {
    fetch(`${BACKEND_URL}/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ event, data, clientId })
    }).catch(() => {});
  }, []);

  const handleDownloadTrigger = useCallback(
    async input => {
      const finalUrl = typeof input === 'string' ? input : url;
      if (!finalUrl || typeof finalUrl !== 'string') return;

      setLoading(true);
      setError('');
      setVideoData(null);
      setIsPickerOpen(false);
      setStatus('fetching_info');
      setTargetProgress(10);
      setSubStatus('Initializing Engine...');
      setPendingSubStatuses([]);
      setDesktopLogs([]);

      const clientId = generateUUID();

      readSse(
        `${BACKEND_URL}/events?id=${clientId}`,
        data =>
          handleSseMessage(data, finalUrl, {
            setStatus,
            setVideoData,
            setIsPickerOpen,
            setPendingSubStatuses,
            setDesktopLogs,
            setTargetProgress,
            setProgress,
            setSubStatus
          }),
        () => setError('Progress stream disconnected')
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
        setVideoData(prev => ({
          ...prev,
          ...data,
          isPartial: !(data.formats && data.formats.length > 0),
          previewUrl:
            data.previewUrl ||
            data.spotifyMetadata?.previewUrl ||
            prev?.previewUrl
        }));

        if (finalUrl.toLowerCase().includes('spotify.com')) {
          setSelectedFormat('mp3');
          const spotify = data.spotifyMetadata;
          if (spotify?.previewUrl && !playerData) {
            setPlayerData({
              title: spotify.title,
              artist: spotify.artist,
              imageUrl: spotify.cover || spotify.imageUrl || data.cover,
              previewUrl: spotify.previewUrl
            });
            setShowPlayer(true);
          }
        }

        const isFullData = data.formats && data.formats.length > 0;
        if (isFullData) {
          setTargetProgress(90);
          setProgress(90);
        } else {
          setTargetProgress(90);
        }

        setIsPickerOpen(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [
      url,
      generateUUID,
      readSse,
      setStatus,
      setTargetProgress,
      setProgress,
      setSubStatus,
      setPendingSubStatuses,
      setDesktopLogs,
      playerData
    ]
  );

  const handleDownload = useCallback(
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
      titleRef.current = finalTitle;

      const selectedOption = (
        selectedFormat === 'mp4' ? videoData?.formats : videoData?.audioFormats
      )?.find(f => String(f.format_id) === String(formatId));

      const clientId = generateUUID();
      let clientMuxSuccessful = false;

      const reportEME = async (event, data = {}) => {
        fetch(`${BACKEND_URL}/telemetry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({ event, data, clientId })
        }).catch(() => {});
      };

      const isSpotify = url.toLowerCase().includes('spotify.com');

      try {
        if (!isSpotify) {
          setDesktopLogs(prev => [
            ...prev,
            `[System] Edge Muxing Engine: INITIALIZING...`
          ]);
          reportEME('START', { url });
        }

        const params = new URLSearchParams({
          url,
          id: clientId,
          formatId,
          targetUrl:
            videoData?.targetUrl || videoData?.spotifyMetadata?.targetUrl || ''
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const urlResponse = await fetch(
          `${BACKEND_URL}/stream-urls?${params}`,
          {
            signal: controller.signal,
            headers: {
              'ngrok-skip-browser-warning': 'true'
            }
          }
        );
        clearTimeout(timeoutId);

        if (urlResponse.ok && !isSpotify) {
          const responseData = await urlResponse.json();

          const isVideoMerge =
            responseData.type === 'merge' ||
            (responseData.output?.filename &&
              responseData.output.filename.endsWith('.mp4'));

          if (responseData.status === 'local-processing' && isVideoMerge) {
            clientMuxSuccessful = true;
            const { tunnel, output } = responseData;
            const { filename, totalSize } = output;
            const safeFilename = filename.replace(/[^\x00-\x7F]/g, '');
            const streamId = (typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 10));

            try {
              const isSwReady = navigator.serviceWorker.controller !== null;

              const pumpChunk = (chunk, done = false, size = 0) => {
                if (isSwReady && navigator.serviceWorker.controller) {
                  const message = {
                    type: 'STREAM_DATA',
                    streamId: streamId,
                    chunk: chunk,
                    done: done,
                    size: size
                  };
                  if (chunk) {
                    navigator.serviceWorker.controller.postMessage(message, [
                      chunk.buffer
                    ]);
                  } else {
                    navigator.serviceWorker.controller.postMessage(message);
                  }
                }
              };

              const triggerDownload = () => {
                if (isSwReady) {
                  const streamUrl = `/EME_STREAM_DOWNLOAD/${streamId}/${encodeURIComponent(
                    safeFilename
                  )}`;
                  
                  globalThis.location.href = streamUrl;
                  
                  setTargetProgress(100);
                  setProgress(100);
                  setStatus('completed');
                  setSubStatus('SUCCESS: Check Browser Downloads');
                  
                  setTimeout(() => setLoading(false), 5000);
                  
                  setDesktopLogs(prev => [
                    ...prev,
                    `[System] Handshake Established. Browser taking over...`
                  ]);
                }
              };

              let downloadTriggered = false;
              const onProgress = (s, p, extra) => {
                setStatus('eme_downloading'); // Fixed status to prevent flickering
                setTargetProgress(p);
                // Only update subStatus for major transitions
                if (extra.subStatus && !extra.subStatus.includes('%')) {
                   setSubStatus('Streaming High-Speed Data...');
                   setDesktopLogs(prev => [...prev, `[EME] ${extra.subStatus}`]);
                }
              };

              const onLog = msg => {
                if (
                  msg.includes('frame=') ||
                  msg.includes('size=') ||
                  msg.includes('time=') ||
                  msg.includes('bitrate=')
                )
                  return;
                setDesktopLogs(prev => [...prev, `[EME_LOG] ${msg}`]);
              };

              const result = await muxVideoAudio(
                tunnel[0],
                tunnel[1],
                filename,
                onProgress,
                onLog,
                c => {
                  if (!downloadTriggered) {
                    downloadTriggered = true;
                    // Pass totalSize here so the download manager knows the final size!
                    pumpChunk(null, false, totalSize); 
                    triggerDownload();
                  }
                  pumpChunk(c);
                }
              );

              if (result) {
                pumpChunk(null, true);
                return;
              }
            } catch (muxErr) {
              console.error(muxErr);
              setDesktopLogs(prev => [
                ...prev,
                `[System] Muxing failed: ${muxErr.message}. Falling back to server...`
              ]);
              clientMuxSuccessful = false; 
            } finally {
              if (!clientMuxSuccessful) setLoading(false);
            }
          }
        }
      } catch (err) {
        console.error('EME Error:', err);
      }

      if (clientMuxSuccessful) return;

      setTargetProgress(10);
      setPendingSubStatuses(['Connecting to Cloud Orchestrator...']);
      setDesktopLogs(prev => [
        ...prev,
        '[System] Using Server-Side Turbo Engine...'
      ]);

      const serverClientId = generateUUID();

      readSse(`${BACKEND_URL}/events?id=${serverClientId}`, data => {
        if (data.status === 'error') {
          setError(data.message);
          setLoading(false);
          return;
        }
        if (data.status) setStatus(data.status);
        if (data.subStatus) {
          if (data.subStatus.startsWith('STREAM ESTABLISHED')) {
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
          setTargetProgress(prev => Math.max(prev, data.progress));
          if (data.progress === 100) {
            setProgress(100);
            setTargetProgress(100);
          }
        }
        if (data.status === 'downloading' && data.progress === 100) {
          setProgress(100);
          setTargetProgress(100);
          setTimeout(() => {
            setLoading(false);
            setStatus('completed');
          }, 800);
        }
      });

      try {
        const finalFormatParam =
          selectedFormat === 'mp4'
            ? selectedOption?.format_id
            : selectedOption?.extension || selectedFormat;

        const finalFormatId = selectedOption?.format_id || formatId;

        const downloadUrl = `${BACKEND_URL}/convert?url=${encodeURIComponent(
          url
        )}&format=${finalFormatParam}&formatId=${finalFormatId}&targetUrl=${encodeURIComponent(
          videoData?.targetUrl || videoData?.spotifyMetadata?.targetUrl || ''
        )}&id=${serverClientId}&title=${encodeURIComponent(
          finalTitle
        )}&artist=${encodeURIComponent(artist)}`;

        const fileName = getSanitizedFilename(
          finalTitle,
          artist,
          finalFormatParam,
          url.includes('spotify.com')
        );

        const wasTriggered = triggerMobileDownload({
          url: downloadUrl,
          fileName,
          mimeType:
            finalFormatParam === 'mp3'
              ? 'audio/mpeg'
              : finalFormatParam === 'm4a'
              ? 'audio/mp4'
              : 'video/webm'
        });

        if (!wasTriggered) {
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch (err) {
        if (!clientMuxSuccessful) setError(err.message);
      }
    },
    [
      loading,
      status,
      videoData,
      selectedFormat,
      url,
      triggerMobileDownload,
      generateUUID,
      readSse,
      setStatus,
      setTargetProgress,
      setProgress,
      setSubStatus,
      setPendingSubStatuses,
      setDesktopLogs,
      setVideoTitle,
      playerData,
      titleRef
    ]
  );

  const handlePaste = useCallback(
    async input => {
      const pastedVal = input && typeof input === 'string' ? input : '';
      if (pastedVal) {
        setUrl(pastedVal);
        await handleDownloadTrigger(pastedVal);
      }
    },
    [handleDownloadTrigger]
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
    handleDownloadTrigger,
    handleDownload,
    handlePaste,
    requestClipboard
  };
};
