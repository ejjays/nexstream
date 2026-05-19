import { useCallback, useEffect, useRef, useMemo } from 'react';
import { useRemixStore } from '../store/useRemixStore';

const MASTER_BOX_OFFSET = 0; // align with UI grid

export interface RemixEngineHook {
  loadAudioSources: (stems: Record<string, string>) => Promise<void>;
  stopAll: () => void;
  togglePlay: () => void;
  handleSeek: (time: number) => void;
  handleVolumeChange: (key: string, volume: number) => void;
  handleVolumeCommit: (key: string, volume: number) => void;
}

export const useRemixEngine = (
  beats: number[] | null,
  isMetronome: boolean,
  playTick: (isDownbeat: boolean) => void,
  gridShift: number = 0
): RemixEngineHook => {
  const isPlaying = useRemixStore((state) => state.isPlaying);
  const setIsPlaying = useRemixStore((state) => state.setIsPlaying);
  const setCurrentTime = useRemixStore((state) => state.setCurrentTime);
  const setCurrentBeatIdx = useRemixStore((state) => state.setCurrentBeatIdx);
  const setBeatFlash = useRemixStore((state) => state.setBeatFlash);

  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const requestRef = useRef<number>(0);
  const lastAudioTime = useRef<number>(0);
  const lastPerfTime = useRef<number>(0);
  const lastSyncTime = useRef<number>(0);
  const lastBeatRef = useRef<number>(-1);
  const checkReadyRef = useRef<any>(null);
  const isWaitingForStallRef = useRef<boolean>(false);

  const loadAudioSources = useCallback(async (stems: Record<string, string>) => {
    try {
      // reset tracks
      Object.values(audioRefs.current).forEach(a => {
        a.pause();
        a.src = '';
      });
      audioRefs.current = {};

      const loadPromises = Object.entries(stems).map(([key, stemPath]) => {
        return new Promise<void>((resolve) => {
          const audio = new Audio();
          audio.crossOrigin = 'anonymous';

          audio.src = stemPath;
          audio.preload = 'metadata'; // fetch metadata

          const onReady = () => {
            audio.removeEventListener('loadedmetadata', onReady);
            audio.removeEventListener('error', onError);
            
            // set duration
            if (audio.duration && isFinite(audio.duration) && useRemixStore.getState().duration === 0) {
                useRemixStore.getState().setDuration(audio.duration);
            }
            resolve();
          };
          const onError = () => {
            audio.removeEventListener('loadedmetadata', onReady);
            audio.removeEventListener('error', onError);
            console.warn(`[Engine] load failed or interrupted: ${key}`);
            resolve(); // ignore error
          };

          audio.addEventListener('loadedmetadata', onReady);
          audio.addEventListener('error', onError);
          audioRefs.current[key] = audio;

          audio.load();
        });
      });

      // unlock UI
      useRemixStore.getState().setIsReady(true);
      await Promise.all(loadPromises);

    } catch (err) {
      console.error('[Engine] load error', err);
      throw err;
    }
  }, []);

  const stopAll = useCallback(() => {
    setIsPlaying(false);
    Object.values(audioRefs.current).forEach(a => {
      a.pause();
      a.currentTime = 0;
    });
    setCurrentTime(0);
    lastAudioTime.current = 0;
    lastPerfTime.current = 0;
    lastSyncTime.current = 0;
    lastBeatRef.current = -1;
  }, [setIsPlaying, setCurrentTime]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      Object.values(audioRefs.current).forEach(a => a.pause());
    } else {
      Object.values(audioRefs.current).forEach(a => a.play().catch(e => {
        if (e.name !== 'AbortError') console.debug('play blocked', e);
      }));
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const handleSeek = useCallback((time: number) => {
    Object.values(audioRefs.current).forEach(a => {
      a.currentTime = time;
    });
    setCurrentTime(time);
    lastAudioTime.current = time;
    lastPerfTime.current = performance.now();
  }, [setCurrentTime]);

  const handleVolumeChange = useCallback((key: string, volume: number) => {
    if (audioRefs.current[key]) {
      audioRefs.current[key].volume = volume;
    }
  }, []);

  const handleVolumeCommit = useCallback((key: string, volume: number) => {
    if (audioRefs.current[key]) {
      audioRefs.current[key].volume = volume;
    }
  }, []);

  const animate = useCallback((perfTime: number) => {
    const activeKeys = Object.keys(audioRefs.current);
    if (activeKeys.length === 0) return;

    const master = audioRefs.current['original'] || audioRefs.current[activeKeys[0]];
    if (!master) return;

    if (isPlaying && !master.paused) {
        // sync check
        let minTime = master.currentTime;
        let maxTime = master.currentTime;
        activeKeys.forEach(k => {
            const t = audioRefs.current[k].currentTime;
            if (t < minTime) minTime = t;
            if (t > maxTime) maxTime = t;
        });

        const spread = maxTime - minTime;
        if (spread > 0.5) {
            if (!isWaitingForStallRef.current) {
                console.log(`[Engine] Global stall detected! Spread: ${spread.toFixed(2)}s. Pausing fast tracks.`);
            }
            isWaitingForStallRef.current = true;
            activeKeys.forEach(k => {
                const track = audioRefs.current[k];
                if (track.currentTime - minTime > 0.05) {
                    if (!track.paused) track.pause();
                } else {
                    if (track.paused) track.play().catch(e => {
                        if (e.name !== 'AbortError') console.debug('stall play blocked', e);
                    });
                }
            });
        } else if (isWaitingForStallRef.current && spread <= 0.1) {
            console.log(`[Engine] Stall recovered! Snapping all to ${minTime.toFixed(2)}s and resuming.`);
            isWaitingForStallRef.current = false;
            activeKeys.forEach(k => {
                const track = audioRefs.current[k];
                track.currentTime = minTime; // perfect snap
                if (track.paused) track.play().catch(e => {
                    if (e.name !== 'AbortError') console.debug('resume play blocked', e);
                });
            });
        }

        // throttled sync
        if (!isWaitingForStallRef.current && perfTime - lastSyncTime.current > 1000) {
            const rawTime = master.currentTime;
            activeKeys.forEach(k => {
                const track = audioRefs.current[k];
                if (track !== master) {
                    const drift = track.currentTime - rawTime;
                    const absDrift = Math.abs(drift);
                    
                    if (absDrift > 0.02) {
                        if (absDrift > 0.15) {
                            track.playbackRate = drift < 0 ? 1.08 : 0.92;
                        } else {
                            track.playbackRate = drift < 0 ? 1.03 : 0.97;
                        }
                    } else {
                        if (track.playbackRate !== 1.0) track.playbackRate = 1.0;
                    }
                    
                    if (track.paused) track.play().catch(e => {
                        if (e.name !== 'AbortError') console.debug('sync play blocked', e);
                    });
                }
            });
            lastSyncTime.current = perfTime;
        }

        // update UI
        if (!isWaitingForStallRef.current && !master.paused) {
            const rawTime = master.currentTime;

            if (rawTime !== lastAudioTime.current) {
                lastAudioTime.current = rawTime;
                lastPerfTime.current = perfTime;
            }

            // smooth UI progression
            let smoothTime = lastAudioTime.current + (perfTime - lastPerfTime.current) / 1000;
            // clamp time
            if (smoothTime - rawTime > 0.1) smoothTime = rawTime;

            setCurrentTime(smoothTime);

            const syncTime = smoothTime + 0.02;
            if (beats && beats.length > 0) {
              const bIdx = beats.findIndex(
                (b: number, i: number) => b <= syncTime && (i === beats.length - 1 || beats[i + 1] > syncTime)
              );

              if (bIdx !== -1 && bIdx !== lastBeatRef.current) {
                lastBeatRef.current = bIdx;
                setCurrentBeatIdx(Math.round(bIdx + MASTER_BOX_OFFSET + gridShift));

                const isDownbeat = bIdx % 4 === 0;
                if (isMetronome) playTick(isDownbeat);

                setBeatFlash(true);
                setTimeout(() => setBeatFlash(false), 80);
              }
            }
        }
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [beats, isMetronome, playTick, gridShift, isPlaying, setCurrentTime, setCurrentBeatIdx, setBeatFlash]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(requestRef.current);
      if (checkReadyRef.current) clearInterval(checkReadyRef.current);
    };
  }, [animate]);

  return useMemo(() => ({
    loadAudioSources,
    stopAll,
    togglePlay,
    handleSeek,
    handleVolumeChange,
    handleVolumeCommit
  }), [
    loadAudioSources,
    stopAll,
    togglePlay,
    handleSeek,
    handleVolumeChange,
    handleVolumeCommit
  ]);
};
