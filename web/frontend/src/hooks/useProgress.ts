import { useEffect, useRef } from 'react';
import { useRemixStore } from '../store/useRemixStore';

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
  const setPendingSubStatuses = useRemixStore(
    (state) => state.setPendingSubStatuses
  );
  const desktopLogs = useRemixStore((state) => state.desktopLogs);
  const setDesktopLogs = useRemixStore((state) => state.setDesktopLogs);
  const videoData = useRemixStore((state) => state.videoData);
  const isPickerOpen = useRemixStore((state) => state.isPickerOpen);

  // set progress milestones
  useEffect(() => {
    if (!isPickerOpen || !videoData) return;
    const data = videoData as {
      title?: string;
      formats?: unknown[];
      isFullData?: boolean;
    };
    const hasUsableFormats =
      Array.isArray(data.formats) && data.formats.length > 0;
    const hasTitle = Boolean(data.title);

    let bump = 0;
    if (data.isFullData === true && targetProgress < 95) bump = 95;
    else if (hasUsableFormats && targetProgress < 90) bump = 90;
    else if (hasTitle && targetProgress < 70) bump = 70;

    if (bump > 0) setTargetProgress(bump);
  }, [isPickerOpen, videoData, targetProgress, setTargetProgress]);

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    if (status === 'idle') {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    lastFrameRef.current = performance.now();

    // use RAF animation
    const tick = (now: number) => {
      const dt = Math.max(0, now - lastFrameRef.current);
      lastFrameRef.current = now;
      setProgress((prev: number) => {
        if (targetProgress >= 100 || status === 'completed') {
          if (prev >= 100) return 100;
          if (status === 'completed') return 100;
          // terminal sweep
          return Math.min(prev + dt * 0.06, 100);
        }

        if (prev >= targetProgress) return prev;

        const diff = targetProgress - prev;

        // scale by delta
        let perSecond;
        if (diff >= 20) perSecond = diff * 4;
        else if (diff >= 5) perSecond = diff * 1.5;
        else perSecond = Math.max(diff * 1, 8);
        let next = prev + (perSecond * dt) / 1000;

        // final-phase nudge
        if (
          status === 'fetching_info' &&
          targetProgress >= 90 &&
          next < targetProgress
        ) {
          next = Math.max(next, prev + (4 * dt) / 1000);
        }

        return Math.min(next, targetProgress);
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // skipcq: JS-0045
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [status, targetProgress, setProgress]);

  useEffect(() => {
    if (status !== 'fetching_info' && status !== 'initializing') return;
    if (targetProgress >= 100) return;

    const interval = setInterval(() => {
      setTargetProgress((prev: number) => {
        if (prev >= 100) return 100;

        if (prev >= 20 && status === 'initializing') return prev;
        return prev;
      });
    }, 80);

    // skipcq: JS-0045
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
