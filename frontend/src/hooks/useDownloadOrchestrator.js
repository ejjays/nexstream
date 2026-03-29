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
        const cleanUrl = url.split('&id=')[0].split('?id=')[0];
        const finalFormatExtension =
          selectedFormat === 'mp4'
            ? (selectedOption?.extension || 'mp4')
            : selectedOption?.extension || selectedFormat;

        const finalFormatId = selectedOption?.format_id || formatId;

        const downloadUrl = `${BACKEND_URL}/convert?url=${encodeURIComponent(
          cleanUrl
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
          setDesktopLogs(prev => [...prev, `[System] Edge Muxing Engine: INITIALIZING...`]);
          const cleanUrl = url.split('&id=')[0].split('?id=')[0];
          reportEME('START', { url: cleanUrl }, clientId);

          const params = new URLSearchParams({ url: cleanUrl, id: clientId, formatId, targetUrl });
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);

          const urlResponse = await fetch(`${BACKEND_URL}/stream-urls?${params}`, {
            signal: controller.signal,
            headers: { 'ngrok-skip-browser-warning': 'true' }
          }).catch(() => ({ ok: false }));
          clearTimeout(timeoutId);

          if (urlResponse.ok) {
            const responseData = await urlResponse.json();

            if (responseData.status === 'local-processing') {
              setDesktopLogs(prev => [...prev, `${getTS()} [System] Edge Muxing Engine: DATA_PIPE_ESTABLISHED`]);
              const { tunnel, output, type, videoUrl, audioUrl } = responseData;
              const { filename, totalSize } = output;

              clientMuxSuccessful = true;
              const safeFilename = filename.replace(/[<>:"/\\|?*]/g, '').trim() || 'video';
              const streamId = generateUUID();

              try {
                const isSwReady = navigator.serviceWorker.controller !== null;
                console.log(`${getTS()} [System] EME Prep: streamId=${streamId}, file=${safeFilename}, swReady=${isSwReady}`);

                const pumpChunk = (chunk, done = false, size = 0) => {
                  if (isSwReady && navigator.serviceWorker.controller) {
                    const message = { type: 'STREAM_DATA', streamId, chunk, done, size };
                    if (chunk) {
                      navigator.serviceWorker.controller.postMessage(message, [chunk.buffer]);
                    } else {
                      navigator.serviceWorker.controller.postMessage(message);
                    }
                  }
                };

                const triggerDownload = () => {
                  if (isSwReady) {
                    const streamUrl = `/EME_STREAM_DOWNLOAD/${streamId}/${encodeURIComponent(safeFilename)}`;
                    console.log(`${getTS()} [System] Triggering EME download:`, streamUrl);
                    const link = document.createElement('a');
                    link.href = streamUrl;
                    link.download = safeFilename;
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    try {
                      link.click();
                    } catch (e) {
                      window.location.assign(streamUrl);
                    }
                    setTimeout(() => { if (document.body.contains(link)) document.body.removeChild(link); }, 5000);
                  } else {
                    setSubStatus("ERROR: Browser background process not ready.");
                  }
                };

                const swConnectionPromise = new Promise(resolve => {
                  const connHandler = (e) => {
                    if (e.data.type === 'STREAM_CONNECTED' && e.data.streamId === streamId) {
                      console.log(`${getTS()} [System] SW Connection Confirmed`);
                      navigator.serviceWorker.removeEventListener('message', connHandler);
                      resolve();
                    }
                  };
                  navigator.serviceWorker.addEventListener('message', connHandler);
                  setTimeout(resolve, 2000); // safety timeout
                });

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

                const pumpFile = async (input, totalSize) => {
                  const isFile = input instanceof File || input instanceof Blob;
                  const stream = isFile ? input.stream() : input.body;
                  const reader = stream.getReader();
                  console.log(`${getTS()} [System] Streaming to browser buffer (Size: ${totalSize})...`);
                  let received = 0;
                  try {
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      received += value.length;
                      pumpChunk(value, false, totalSize);
                      if (received % (10 * 1024 * 1024) < value.length) {
                        setSubStatus(`SUCCESS: Transmitting ${(received / 1024 / 1024).toFixed(1)}MB`);
                      }
                    }
                    pumpChunk(null, true, totalSize);
                    setDesktopLogs(prev => [...prev, `${getTS()} [System] Stream transmission complete.`]);
                  } catch (err) {
                    console.error("[EME] Stream Pipe Error:", err);
                    throw err;
                  }
                };

                if (type === 'merge' && tunnel.length >= 2) {
                  // ... (existing local muxing code)
                } else if (tunnel.length === 1 && tunnel[0].includes('/convert')) {
                  // server side merge
                  // bypass sw pump
                  setDesktopLogs(prev => [...prev, `${getTS()} [System] Turbo Engine: STREAM_READY`]);
                  setSubStatus('SUCCESS: Check Browser Downloads');
                  setStatus('completed');
                  setProgress(100);
                  setTargetProgress(100);

                  const link = document.createElement('a');
                  link.href = tunnel[0];
                  link.download = safeFilename;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  return;
                } else if (tunnel.length > 0) {
                  const isAudioFormat = selectedFormat === 'mp3' || selectedFormat === 'm4a' || !videoUrl;
                  if (isAudioFormat) {
                    const { processAudioOnly } = await import('../lib/muxer');
                    setDesktopLogs(prev => [...prev, `${getTS()} [System] Edge Muxing Engine: STARTING_BITSTREAM_PIPE`]);
                    let coverBlob = null;
                    if (videoData?.thumbnail || videoData?.cover) {
                      try {
                        const cRes = await fetch(videoData.cover || videoData.thumbnail);
                        if (cRes.ok) coverBlob = await cRes.blob();
                      } catch (e) {}
                    }
                    const result = await processAudioOnly(tunnel[0], { title: finalTitle, artist, album: videoData?.album || '', coverBlob }, onProgress, onLog, () => {});
                    if (result && result.file) {
                      setStatus('completed');
                      setSubStatus('SUCCESS: Check Browser Downloads');
                      pumpChunk(null, false, result.size);
                      triggerDownload();
                      await swConnectionPromise;
                      await pumpFile(result.file, result.size);
                      const ext = result.file.name.split('.').pop();
                      const s = await OPFSStorage.init(`audio-output.${ext}`, false);
                      await s.delete();
                    }
                  } else {
                    setDesktopLogs(prev => [...prev, `${getTS()} [System] Edge Muxing Engine: STARTING_DIRECT_TUNNEL`]);
                    const fetchResponse = await fetch(tunnel[0]);
                    if (!fetchResponse.ok) throw new Error("Failed to fetch direct tunnel.");
                    const contentLength = +fetchResponse.headers.get('Content-Length') || totalSize || 0;
                    setStatus('completed');
                    setSubStatus('SUCCESS: Check Browser Downloads');
                    pumpChunk(null, false, contentLength);
                    triggerDownload();
                    await swConnectionPromise;
                    await pumpFile(fetchResponse, contentLength);
                  }
                }
                return;
              } catch (muxErr) {
                console.error(muxErr);
                setDesktopLogs(prev => [...prev, `${getTS()} [System] Muxing failed: ${muxErr.message}. Falling back to server...`]);
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
      runServerSideDownload({ finalTitle, artist, selectedOption, formatId, serverClientId, targetUrl });
    },
    [
      loading, status, videoData, selectedFormat, url, generateUUID, reportEME, runServerSideDownload,
      setIsPickerOpen, setLoading, setError, setStatus, setTargetProgress, setProgress, setSubStatus,
      setPendingSubStatuses, setDesktopLogs, setVideoTitle
    ]
  );

  return { startDownload };
};
