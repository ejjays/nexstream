// @ts-nocheck
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
  if (data.status) setStatus(data.status);

  if (data.metadata_update) {
    const update = data.metadata_update;
    
    setVideoData((prev) => {
      const isNowFull = update.isFullData === true;
      return {
        ...prev,
        ...update,
        totalSize: update.totalSize || prev?.totalSize,
        thumbnail: update.cover || update.thumbnail || prev?.thumbnail || prev?.cover,
        cover: update.cover || update.thumbnail || prev?.cover || prev?.thumbnail,
        isPartial: isNowFull ? false : (update.isPartial !== undefined ? update.isPartial : prev?.isPartial),
        spotifyMetadata: update.spotifyMetadata || prev?.spotifyMetadata || null,
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
    const log = `${timestamp} ${data.subStatus}`.trim();
    setDesktopLogs((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === log) return prev;
      return [...prev, log];
    });
  }

  if (data.details) {
    const log = `${timestamp} ${data.details}`.trim();
    setDesktopLogs((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === log) return prev;
      return [...prev, log];
    });
  }

  if (data.progress !== undefined) {
    const numericProgress = Number(data.progress);
    if (!isNaN(numericProgress)) {
      // throttle progress updates
      setTargetProgress((prev) => {
        const current = prev || 0;
        if (numericProgress >= 100 || Math.abs(numericProgress - current) >= 1) {
          return numericProgress;
        }
        return current;
      });
      
      if (data.details?.startsWith("BRAIN_LOOKUP_SUCCESS"))
        setProgress(numericProgress);
    }
  }
};
