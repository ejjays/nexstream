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
  const setVideoData = useRemixStore((state) => state.setVideoData);
  const isPickerOpen = useRemixStore((state) => state.isPickerOpen);
  const setIsPickerOpen = useRemixStore((state) => state.setIsPickerOpen);

  const intervalRef = useRef(null);

  useEffect(() => {
    if (status === "idle") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (targetProgress >= 100 || status === "completed") {
          if (prev >= 100) {
            clearInterval(intervalRef.current);
            return 100;
          }
          if (status === "completed") return 100;
          return Math.min(prev + 1, 100); 
        }
        
        if (prev >= targetProgress) return prev;

        const diff = targetProgress - prev;
        // ramp up progress
        const step = diff > 20 ? diff * 0.1 : (diff > 5 ? 0.3 : 0.05);
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
        setTargetProgress((prev) => {
          if (prev >= 100) return 100;

          if (status === "fetching_info") {
            if (prev >= 90) return prev;
            const increment =
              prev < 50
                ? Math.random() * 0.6 + 0.2
                : Math.random() * 0.2 + 0.05;
            return Math.min(prev + increment, 90);
          }

          if (prev >= 20) return prev;
          return Math.min(prev + 0.2, 20);
        });
      },
      status === "fetching_info" ? 50 : 80,
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
