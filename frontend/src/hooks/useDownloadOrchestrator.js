import { useCallback, useRef } from 'react';
import { BACKEND_URL } from '../lib/config';
import { getSanitizedFilename } from '../lib/utils';
import { muxVideoAudio } from '../lib/muxer';
import { OPFSStorage } from '../lib/opfs';

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

  const getTS = () => {
    const n = new Date();
    return `[${n.getHours().toString().padStart(2, '0')}:${n.getMinutes().toString().padStart(2, '0')}:${n.getSeconds().toString().padStart(2, '0')}.${n.getMilliseconds().toString().padStart(3, '0')}]`;
  };

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
      setDesktopLogs(prev => [...prev, `${getTS()} [System] Using Server-Side Turbo Engine...`]);

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
          setDesktopLogs(prev => [...prev, `${getTS()} ${data.subStatus}`]);
        }
        if (data.details) setDesktopLogs(prev => [...prev, `${getTS()} ${data.details}`]);
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

          const params = new URLSearchParams({
            url,
            id: clientId,
            formatId,
            targetUrl
          });

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);

          const urlResponse = await fetch(
            `${BACKEND_URL}/stream-urls?${params}`,
            {
              signal: controller.signal,
              headers: {
                'ngrok-skip-browser-warning': 'true'
              }
            }
          ).catch(() => ({ ok: false }));
          clearTimeout(timeoutId);

          if (urlResponse.ok) {
            const responseData = await urlResponse.json();

          if (responseData.status === 'local-processing') {
            setDesktopLogs(prev => [
              ...prev,
              `${getTS()} [System] Edge Muxing Engine: DATA_PIPE_ESTABLISHED`
            ]);
            const { tunnel, output, type } = responseData;
            const { filename, totalSize } = output;

            // temporarily disable eme
            clientMuxSuccessful = false;
            
            if (false) { // disabled block
              clientMuxSuccessful = true;
              const safeFilename = filename.replace(/[<>:"/\\|?*]/g, '').trim() || 'video';
              const streamId = generateUUID();

              try {
                const isSwReady = navigator.serviceWorker.controller !== null;
                console.log(`${getTS()} [System] EME Prep: streamId=${streamId}, file=${safeFilename}, swReady=${isSwReady}`);

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
                    
                    console.log(`${getTS()} [System] Triggering EME download:`, streamUrl);
                    
                    // use link click first
                    const link = document.createElement('a');
                    link.href = streamUrl;
                    link.download = safeFilename;
                    document.body.appendChild(link);
                    link.click();
                    
                    // fallback after short delay
                    setTimeout(() => {
                        if (document.body.contains(link)) {
                            document.body.removeChild(link);
                        }
                    }, 100);

                    setTargetProgress(100);
                    setProgress(100);
                    setStatus('completed');
                    setSubStatus('SUCCESS: Check Browser Downloads');
                    
                    setTimeout(() => {
                      setLoading(false);
                    }, 5000);
                    
                    setDesktopLogs(prev => [
                      ...prev,
                      `${getTS()} [System] Handshake Established. Browser taking over...`
                    ]);
                  }
                };

                const onProgress = (s, p, extra) => {
                  setStatus('eme_downloading');
                  setTargetProgress(p);
                  if (extra.subStatus) {
                     setSubStatus(extra.subStatus);
                     if (!extra.subStatus.includes('%')) {
                        setDesktopLogs(prev => [...prev, `${getTS()} [EME] ${extra.subStatus}`]);
                     }
                  }
                };

                const onLog = msg => {
                  if (!msg.includes('frame=') && !msg.includes('bitrate=')) {
                    setDesktopLogs(prev => [...prev, `${getTS()} [EME_LOG] ${msg}`]);
                  }
                };

                const chunkQueue = [];
                let processingQueue = false;

                const processQueue = async () => {
                  if (processingQueue || chunkQueue.length === 0) return;
                  processingQueue = true;
                  
                  while (chunkQueue.length > 0) {
                    const item = chunkQueue.shift();
                    pumpChunk(item.chunk, item.done, item.size);
                  }
                  
                  processingQueue = false;
                };

                const handleChunk = (chunk, done = false, size = 0) => {
                  chunkQueue.push({ chunk, done, size });
                  processQueue();
                };

                const pumpFile = async (file, totalSize) => {
                  const reader = file.stream().getReader();
                  setDesktopLogs(prev => [...prev, `${getTS()} [System] Streaming to browser buffer...`]);
                  setSubStatus('SUCCESS: Downloading to Browser...');
                  
                  let received = 0;
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    received += value.length;
                    pumpChunk(value, false, totalSize);
                    
                    // update status every ~10MB
                    if (received % (10 * 1024 * 1024) < value.length) {
                        setSubStatus(`SUCCESS: Received ${(received / 1024 / 1024).toFixed(1)}MB`);
                    }
                  }
                  pumpChunk(null, true, totalSize); // final done signal
                  setDesktopLogs(prev => [...prev, `${getTS()} [System] Stream transmission complete.`]);
                };

                if (type === 'merge' && tunnel.length >= 2) {
                    setDesktopLogs(prev => [...prev, `${getTS()} [System] Edge Muxing Engine: STARTING_A/V_ALIGNMENT`]);
                    const result = await muxVideoAudio(
                      tunnel[0],
                      tunnel[1],
                      filename,
                      onProgress,
                      onLog,
                      () => {} // chunking handled manually now
                    );
                    
                    if (result && result.file) {
                        setStatus('completed');
                        setSubStatus('SUCCESS: Check Browser Downloads');
                        setDesktopLogs(prev => [...prev, `${getTS()} [System] Muxing complete. Initiating transfer...`]);
                        
                        // register with SW
                        pumpChunk(null, false, result.size);

                        // trigger download first, then start pumping
                        triggerDownload();

                        // small delay to let browser handshake with SW
                        await new Promise(r => setTimeout(r, 500));

                        console.log(`${getTS()} [System] Streaming ${result.size} bytes to browser...`);
                        await pumpFile(result.file, result.size);

                        // cleanup
                        const s = await OPFSStorage.init(`muxed-${filename.toLowerCase().endsWith('.webm') ? 'output.webm' : 'output.mp4'}`, false);
                        await s.delete();
                    }
                } else {
                    const { processAudioOnly } = await import('../lib/muxer');
                    setDesktopLogs(prev => [...prev, `${getTS()} [System] Edge Muxing Engine: STARTING_BITSTREAM_PIPE`]);
                    
                    let coverBlob = null;
                    if (videoData?.thumbnail || videoData?.cover) {
                        try {
                            const cRes = await fetch(videoData.cover || videoData.thumbnail);
                            if (cRes.ok) coverBlob = await cRes.blob();
                        } catch (e) {
                            console.warn("Failed to fetch cover art:", e);
                        }
                    }

                    const result = await processAudioOnly(
                        tunnel[0],
                        {
                            title: finalTitle,
                            artist: artist,
                            album: videoData?.album || '',
                            coverBlob
                        },
                        onProgress,
                        onLog,
                        () => {}
                    );
                    
                    if (result && result.file) {
                        setStatus('completed');
                        setSubStatus('SUCCESS: Check Browser Downloads');
                        
                        pumpChunk(null, false, result.size);
                        triggerDownload();
                        
                        await new Promise(r => setTimeout(r, 500));
                        await pumpFile(result.file, result.size);

                        const ext = result.file.name.split('.').pop();
                        const s = await OPFSStorage.init(`audio-output.${ext}`, false);
                        await s.delete();
                    }
                }
                return;
              } catch (muxErr) {
                console.error(muxErr);
                setDesktopLogs(prev => [
                  ...prev,
                  `${getTS()} [System] Muxing failed: ${muxErr.message}. Falling back to server...`
                ]);
                clientMuxSuccessful = false; 
              } finally {
                if (!clientMuxSuccessful) setLoading(false);
              }
            }
          }
        }
        } // Close if(!isSpotify)
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
