export const useSSE = () => {
  const readSse = async (url, onMessage, onError) => {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (!response.ok) throw new Error("SSE connection failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              onMessage(data);
            } catch (e) {
              console.error("SSE Parse Error:", e);
            }
          }
        }
      }
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
