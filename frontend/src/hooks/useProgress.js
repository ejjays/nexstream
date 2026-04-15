import { useState, useEffect } from "react";

export const useProgress = () => {
  const [progress, setProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [status, setStatus] = useState("idle");
  const [subStatus, setSubStatus] = useState("");
  const [pendingSubStatuses, setPendingSubStatuses] = useState([]);
  const [desktopLogs, setDesktopLogs] = useState([]);

  useEffect(() => {
    if (status === "idle") return;
    if (status === "completed" && progress >= 100) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (targetProgress >= 100 || status === "completed") {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          // jump if completed
          if (status === "completed") return 100;
          // fast completion crawl
          return Math.min(prev + 1.5, 100); 
        }
        
        if (prev >= targetProgress) return prev;

        const diff = targetProgress - prev;
        const step = diff > 5 ? diff * 0.15 : 0.2;
        return Math.min(prev + step, targetProgress);
      });
    }, 16);

    return () => clearInterval(interval);
  }, [status, targetProgress, progress >= 100]);

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
  }, [status, targetProgress]);

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
