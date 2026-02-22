import { useState, useEffect } from 'react';

export const useProgress = (loading, status, targetProgress, setTargetProgress) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!loading && status !== 'completed') return;

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= targetProgress) return prev;
        if (targetProgress >= 100) return 100;

        const diff = targetProgress - prev;
        const step = diff > 5 ? diff * 0.15 : 0.2;
        return Math.min(prev + step, targetProgress);
      });
    }, 16);

    return () => clearInterval(interval);
  }, [loading, targetProgress, status]);

  useEffect(() => {
    if (status !== 'fetching_info' && status !== 'initializing') return;

    const interval = setInterval(
      () => {
        setTargetProgress(prev => {
          if (status === 'fetching_info') {
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
      status === 'fetching_info' ? 50 : 80
    );

    return () => clearInterval(interval);
  }, [status, setTargetProgress]);

  return { progress, setProgress };
};
