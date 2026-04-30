import { useEffect, useRef } from "react";
import { useRemixStore } from "../store/useRemixStore";

export const useProgress = () => {
  const progress = useRemixStore((state) => state.progress);
  const setProgress = useRemixStore((state) => state.setProgress);
  const targetProgress = useRemixStore((state) => state.targetProgress);
  const setTargetProgress = useRemixStore((state) => state.setTargetProgress);
  const status = useRemixStore((state) => state.status);
  const setStatus = useRemixStore((state) => state.setStatus);
  const subStatus = useRemixStore((state) => state.subStatus);
  const setSubStatus = useRemixStore((state) => state.setSubStatus);
  const pendingSubStatuses = useRemixStore((state) => state.pendingSubStatuses);
  const setPendingSubStatuses = useRemixStore((state) => state.setPendingSubStatuses);
  const desktopLogs = useRemixStore((state) => state.desktopLogs);
  const setDesktopLogs = useRemixStore((state) => state.setDesktopLogs);
  const videoData = useRemixStore((state) => state.videoData);
  const isPickerOpen = useRemixStore((state) => state.isPickerOpen);

  // sync modal progress
  useEffect(() => {
    if (isPickerOpen && videoData && !(videoData as any).isPartial) {
      if (targetProgress < 90) setTargetProgress(90);
    }
  }, [isPickerOpen, videoData, targetProgress, setTargetProgress]);

  const intervalRef = useRef<any>(null);

  useEffect(() => {
    if (status === "idle") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setProgress((prev: number) => {
        if (targetProgress >= 100 || status === "completed") {
          if (prev >= 100) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 100;
          }
          if (status === "completed") return 100;
          return Math.min(prev + 1, 100); 
        }
        
        if (prev >= targetProgress) return prev;

        const diff = targetProgress - prev;
        // speed up catchup
        let step = diff > 20 ? diff * 0.2 : 0.5;
        
        // final phase boost
        if (status === 'fetching_info' && targetProgress >= 90) {
          step = Math.max(step, 1.5);
        }

        return Math.min(prev + step, targetProgress);
      });
    }, 16);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, targetProgress, setProgress]);

  useEffect(() => {
    if (status !== "fetching_info" && status !== "initializing") return;
    if (targetProgress >= 100) return;

    const interval = setInterval(
      () => {
        setTargetProgress((prev: number) => {
          if (prev >= 100) return 100;

          if (prev >= 20 && status === "initializing") return prev;
          return prev;
        });
      },
      80,
    );

    return () => clearInterval(interval);
  }, [status, targetProgress, setTargetProgress]);

  return {
    progress,
    setProgress,
    targetProgress,
    setTargetProgress,
    status,
    setStatus,
    subStatus,
    setSubStatus,
    pendingSubStatuses,
    setPendingSubStatuses,
    desktopLogs,
    setDesktopLogs,
  };
};
