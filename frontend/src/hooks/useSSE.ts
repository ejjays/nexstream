interface SSEData {
  status?: string;
  metadata_update?: Record<string, unknown>;
  subStatus?: string;
  details?: string;
  progress?: number | string;
}

interface SSEActions {
  setStatus: (s: string) => void;
  setVideoData: (v: unknown) => void;
  setIsPickerOpen: (o: boolean) => void;
  setPendingSubStatuses: (p: unknown) => void;
  setDesktopLogs: (
    updater: unknown[] | ((prev: unknown[]) => unknown[])
  ) => void;
  setTargetProgress: (updater: unknown) => void;
  setProgress: (p: number) => void;
  setSubStatus: (ss: string) => void;
  getTS: () => string;
}

export const handleSseMessage = (
  data: SSEData,
  url: string,
  {
    setStatus,
    setVideoData,
    setIsPickerOpen,
    setPendingSubStatuses,
    setDesktopLogs,
    setTargetProgress,
    setProgress,
    setSubStatus,
    getTS,
  }: SSEActions
) => {
  if (data.status) setStatus(data.status);

  if (data.metadata_update) {
    const update = data.metadata_update;

    setVideoData((prev: unknown) => {
      const prevData = prev as Record<string, unknown> | null;
      const isNowFull = update.isFullData === true;
      return {
        ...prevData,
        ...update,
        totalSize: update.totalSize || prevData?.totalSize,
        thumbnail:
          update.cover ||
          update.thumbnail ||
          prevData?.thumbnail ||
          prevData?.cover,
        cover:
          update.cover ||
          update.thumbnail ||
          prevData?.cover ||
          prevData?.thumbnail,
        isPartial: isNowFull
          ? false
          : update.isPartial !== undefined
            ? update.isPartial
            : prevData?.isPartial,
        spotifyMetadata:
          update.spotifyMetadata || prevData?.spotifyMetadata || null,
      };
    });
    setTimeout(() => setIsPickerOpen(true), 0);
  }

  const timestamp = getTS ? getTS() : '';

  if (data.subStatus) {
    if (data.subStatus.startsWith('STREAM ESTABLISHED')) {
      setSubStatus(data.subStatus);
    } else {
      setPendingSubStatuses((prev: unknown[]) => [...prev, data.subStatus]);
    }
    const log = `${timestamp} ${data.subStatus}`.trim();
    setDesktopLogs((prev: unknown[]) => {
      const logs = prev as string[];
      if (logs.length > 0 && logs[logs.length - 1] === log) return logs;
      return [...logs, log];
    });
  }

  if (data.details) {
    const log = `${timestamp} ${data.details}`.trim();
    setDesktopLogs((prev: unknown[]) => {
      const logs = prev as string[];
      if (logs.length > 0 && logs[logs.length - 1] === log) return logs;
      return [...logs, log];
    });
  }

  if (data.progress !== undefined) {
    const numericProgress = Number(data.progress);
    if (!isNaN(numericProgress)) {
      // throttle progress updates
      setTargetProgress((prev: number) => {
        const current = prev || 0;
        if (
          numericProgress >= 100 ||
          Math.abs(numericProgress - current) >= 1
        ) {
          return numericProgress;
        }
        return current;
      });

      if (data.details?.startsWith('BRAIN_LOOKUP_SUCCESS'))
        setProgress(numericProgress);
    }
  }
};
