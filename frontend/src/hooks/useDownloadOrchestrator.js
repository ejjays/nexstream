import { useCallback, useRef } from 'react';
import { BACKEND_URL } from '../lib/config';
import { getSanitizedFilename } from '../lib/utils';
import { muxVideoAudio } from '../lib/muxer';

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
  const titleRef = useRef('');

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

  const runServerSideDownload = useCallback(
    async (params) => {
      const { finalTitle, artist, selectedOption, formatId, serverClientId, targetUrl } = params;
      
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
        const finalFormatExtension =
          selectedFormat === 'mp4'
            ? (selectedOption?.extension || 'mp4')
            : selectedOption?.extension || selectedFormat;

        const finalFormatId = selectedOption?.format_id || formatId;

        const downloadUrl = `${BACKEND_URL}/convert?url=${encodeURIComponent(
          url
        )}&format=${finalFormatExtension}&formatId=${finalFormatId}&targetUrl=${encodeURIComponent(
          targetUrl || ''
        )}&id=${serverClientId}&title=${encodeURIComponent(
          finalTitle
        )}&artist=${encodeURIComponent(artist)}`;

        const fileName = getSanitizedFilename(
          finalTitle,
          artist,
          finalFormatExtension,
          url.includes('spotify.com')
        );

        const wasTriggered = triggerMobileDownload({
          url: downloadUrl,
          fileName,
          mimeType:
            finalFormatExtension === 'mp3'
              ? 'audio/mpeg'
              : finalFormatExtension === 'm4a'
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
        setError(err.message);
      }
    },
    [url, selectedFormat, readSse, setStatus, setTargetProgress, setProgress, setSubStatus, setPendingSubStatuses, setDesktopLogs, setError, setLoading, triggerMobileDownload]
  );

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
      titleRef.current = finalTitle;

      const selectedOption = (
        selectedFormat === 'mp4' ? videoData?.formats : videoData?.audioFormats
      )?.find(f => String(f.format_id) === String(formatId));

      const clientId = generateUUID();
      let clientMuxSuccessful = false;
      const isSpotify = url.toLowerCase().includes('spotify.com');
      const targetUrl = videoData?.targetUrl || videoData?.spotifyMetadata?.targetUrl || '';

      try {
        if (!isSpotify) {
          setDesktopLogs(prev => [
            ...prev,
            `[System] Edge Muxing Engine: INITIALIZING...`
          ]);
          reportEME('START', { url }, clientId);
        }

        const params = new URLSearchParams({
          url,
          id: clientId,
          formatId,
          targetUrl
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

          if (responseData.status === 'local-processing') {
            setDesktopLogs(prev => [
              ...prev,
              `[System] Edge Muxing Engine: DATA_PIPE_ESTABLISHED`
            ]);
            const { tunnel, output, type } = responseData;
            const { filename, totalSize } = output;

            if (totalSize && totalSize > 400 * 1024 * 1024) {
              setDesktopLogs(prev => [
                ...prev,
                `[System] File size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds browser limits.`
              ]);
              clientMuxSuccessful = false;
            } else {
              clientMuxSuccessful = true;
              const safeFilename = filename.replace(/[^\x00-\x7F]/g, '');
              const streamId = generateUUID();

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
                const lastLogTimeRef = { current: 0 };
                const onProgress = (s, p, extra) => {
                  setStatus('eme_downloading');
                  setTargetProgress(p);
                  if (extra.subStatus) {
                     setSubStatus(extra.subStatus);
                     const now = Date.now();
                     if (!extra.subStatus.includes('%')) {
                        setDesktopLogs(prev => [...prev, `[EME] ${extra.subStatus}`]);
                     } else if (now - lastLogTimeRef.current > 2000) {
                        setDesktopLogs(prev => [...prev, `[EME] ${extra.subStatus}`]);
                        lastLogTimeRef.current = now;
                     }
                  }
                };

                const onLog = msg => {
                  if (!msg.includes('frame=') && !msg.includes('bitrate=')) {
                    setDesktopLogs(prev => [...prev, `[EME_LOG] ${msg}`]);
                  }
                };

                if (type === 'merge' && tunnel.length >= 2) {
                    const chunks = [];
                    setDesktopLogs(prev => [...prev, `[System] Edge Muxing Engine: STARTING_A/V_ALIGNMENT`]);
                    const result = await muxVideoAudio(
                      tunnel[0],
                      tunnel[1],
                      filename,
                      onProgress,
                      onLog,
                      c => {
                        chunks.push(c);
                      }
                    );
                    
                    if (result) {
                        setStatus('completed');
                        setSubStatus('SUCCESS: Check Browser Downloads');
                        setDesktopLogs(prev => [...prev, `[System] Muxing complete. Generating virtual stream...`]);
                        
                        let exactSize = 0;
                        for (let c of chunks) exactSize += c.length;
                        
                        for (let c of chunks) {
                            pumpChunk(c);
                        }
                        pumpChunk(null, true, exactSize);
                        
                        triggerDownload();
                    }
                } else {
                    const { processAudioOnly } = await import('../lib/muxer');
                    const chunks = [];
                    setDesktopLogs(prev => [...prev, `[System] Edge Muxing Engine: STARTING_BITSTREAM_PIPE`]);
                    const result = await processAudioOnly(
                        tunnel[0],
                        null,
                        filename,
                        onProgress,
                        onLog,
                        c => {
                            chunks.push(new Uint8Array(c));
                        }
                    );
                    
                    if (result) {
                        setStatus('completed');
                        setSubStatus('SUCCESS: Check Browser Downloads');
                        
                        let exactSize = 0;
                        for (let c of chunks) exactSize += c.length;
                        
                        for (let c of chunks) {
                            pumpChunk(c);
                        }
                        pumpChunk(null, true, exactSize);
                        
                        triggerDownload();
                    }
                }
                return;
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
        }
      } catch (err) {
        console.error('EME Error:', err);
      }

      if (clientMuxSuccessful) return;

      const serverClientId = generateUUID();
      
      runServerSideDownload({
        finalTitle,
        artist,
        selectedOption,
        formatId,
        serverClientId,
        targetUrl
      });
      
    },
    [
      loading,
      status,
      videoData,
      selectedFormat,
      url,
      generateUUID,
      reportEME,
      runServerSideDownload,
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
    ]
  );

  return { startDownload };
};
