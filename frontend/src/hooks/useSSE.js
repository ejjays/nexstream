import { useRef, useEffect } from 'react';
import { SSEService } from '../lib/sse.service';

export const useSSE = () => {
  const serviceRef = useRef(null);

  const readSse = async (url, onMessage, onError) => {
    // disconnect any previous session before starting new one
    if (serviceRef.current) serviceRef.current.disconnect();

    const service = new SSEService();
    serviceRef.current = service;

    try {
      await service.connect(url, onMessage, onError);
    } catch (err) {
      console.error("SSE Error:", err);
      onError(err);
    }
  };

  const disconnect = () => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
      serviceRef.current = null;
    }
  };

  // auto cleanup
  useEffect(() => {
    return () => {
      if (serviceRef.current) serviceRef.current.disconnect();
    };
  }, []);

  return { readSse, disconnect };
};


export const handleSseMessage = (
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
    setSubStatus,
    getTS
  },
) => {
  const cleanUrl = (url || '').split('&id=')[0].split('?id=')[0];
  if (data.status) setStatus(data.status);

  if (data.metadata_update) {
    const isSpotify = cleanUrl.toLowerCase().includes("spotify.com");
    const update = data.metadata_update;
    
    if (update.isFullData) {
      setTargetProgress(90);
      setProgress(90);
    }

    setVideoData((prev) => {
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
          : null,
      };
    });
    setTimeout(() => setIsPickerOpen(true), 0);
  }

  const timestamp = getTS ? getTS() : '';

  if (data.subStatus) {
    if (data.subStatus.startsWith("STREAM ESTABLISHED")) {
      setSubStatus(data.subStatus);
    } else {
      setPendingSubStatuses((prev) => [...prev, data.subStatus]);
    }
    setDesktopLogs((prev) => [...prev, `${timestamp} ${data.subStatus}`.trim()]);
  }

  if (data.details) setDesktopLogs((prev) => [...prev, `${timestamp} ${data.details}`.trim()]);

  if (data.progress !== undefined) {
    setTargetProgress((prev) => Math.max(prev, data.progress));
    if (data.details?.startsWith("BRAIN_LOOKUP_SUCCESS"))
      setProgress(data.progress);
  }
};
