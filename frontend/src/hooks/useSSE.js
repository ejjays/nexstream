export const useSSE = () => {
  const readSse = async (url, onMessage, onError) => {
    try {
      // Using XMLHttpRequest is immune to Eruda's fetch breaking
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.withCredentials = false;
        xhr.setRequestHeader('Accept', 'text/event-stream');
        xhr.setRequestHeader('ngrok-skip-browser-warning', 'true');
        
        let seenBytes = 0;
        
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 3 || xhr.readyState === 4) {
             const newData = xhr.responseText.substring(seenBytes);
             seenBytes = xhr.responseText.length;
             
             const lines = newData.split('\n');
             for (const line of lines) {
               const trimmed = line.trim();
               if (trimmed.startsWith("data: ")) {
                 try {
                   const data = JSON.parse(trimmed.slice(6));
                   onMessage(data);
                 } catch (e) {
                   // ignoring partial chunks
                 }
               }
             }
          }
          if (xhr.readyState === 4) {
             if (xhr.status >= 400) reject(new Error("SSE connection failed"));
             else resolve();
          }
        };
        
        xhr.onerror = () => reject(new Error("Network error during SSE"));
        xhr.send();
      });
    } catch (err) {
      console.error("SSE Error:", err);
      onError(err);
    }
  };

  return { readSse };
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
  },
) => {
  if (data.status) setStatus(data.status);

  if (data.metadata_update) {
    const isSpotify = url.toLowerCase().includes("spotify.com");
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

  if (data.subStatus) {
    if (data.subStatus.startsWith("STREAM ESTABLISHED")) {
      setSubStatus(data.subStatus);
    } else {
      setPendingSubStatuses((prev) => [...prev, data.subStatus]);
    }
    setDesktopLogs((prev) => [...prev, data.subStatus]);
  }

  if (data.details) setDesktopLogs((prev) => [...prev, data.details]);

  if (data.progress !== undefined) {
    setTargetProgress((prev) => Math.max(prev, data.progress));
    if (data.progress === 100) {
      setProgress(100);
      setTargetProgress(100);
    }
    if (data.details?.startsWith("BRAIN_LOOKUP_SUCCESS"))
      setProgress(data.progress);
  }
};
