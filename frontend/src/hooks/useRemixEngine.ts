import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useRemixStore } from '../store/useRemixStore';

export interface RemixEngineHook {
  loadAudioSources: (sources: Record<string, string>) => void;
  stopAll: () => void;
  togglePlay: () => Promise<void>;
  handleSeek: (time: number | string) => void;
  handleVolumeChange: (track: string, val: number | string) => void;
  handleVolumeCommit: (track: string, val: number | string) => void;
}

export const useRemixEngine = (
  beats: number[],
  isMetronome: boolean,
  playTick: (isDownbeat: boolean) => void,
  MASTER_BOX_OFFSET = 0
): RemixEngineHook => {
  const isPlaying = useRemixStore(state => state.isPlaying);
  const setIsPlaying = useRemixStore(state => state.setIsPlaying);
  const setDuration = useRemixStore(state => state.setDuration);
  const setCurrentTime = useRemixStore(state => state.setCurrentTime);
  const setCurrentBeatIdx = useRemixStore(state => state.setCurrentBeatIdx);
  const setBeatFlash = useRemixStore(state => state.setBeatFlash);
  const isReady = useRemixStore(state => state.isReady);
  const setIsReady = useRemixStore(state => state.setIsReady);
  const volumes = useRemixStore(state => state.volumes);
  const setVolumeState = useRemixStore(state => state.setVolume);

  const audioRefs = useRef<Record<string, HTMLAudioElement>>({
    vocals: new Audio(),
    drums: new Audio(),
    bass: new Audio(),
    other: new Audio(),
    guitar: new Audio(),
    piano: new Audio()
  });

  const requestRef = useRef<number>(0);
  const lastBeatRef = useRef(-1);
  const isSeekingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const checkReadyRef = useRef<NodeJS.Timeout | null>(null);
  const activeTracksRef = useRef<string[]>([]);
  const isWaitingForStallRef = useRef(false);

  const lastAudioTime = useRef(0);
  const lastPerfTime = useRef(0);
  const lastSyncTime = useRef(0);

  const volumesRef = useRef(volumes);
  useEffect(() => { volumesRef.current = volumes; }, [volumes]);

  const loadAudioSources = useCallback(
    (sources: Record<string, string>) => {
      const activeKeys = Object.keys(sources).filter(key => sources[key]);
      
      let needsReset = activeKeys.length !== activeTracksRef.current.length;
      if (!needsReset) {
        activeKeys.forEach(key => {
          const audio = audioRefs.current[key];
          const currentSrc = audio.src;
          const newSrc = sources[key];
          
          const isMatch = currentSrc.endsWith(newSrc) || currentSrc === newSrc;
          if (!isMatch) {
            needsReset = true;
          }
        });
      }

      if (!needsReset) {
        activeTracksRef.current = activeKeys;
        setIsReady(true);
        return;
      }

      setIsReady(false);
      if (checkReadyRef.current) clearInterval(checkReadyRef.current);

      // reset tracks
      Object.keys(audioRefs.current).forEach(key => {
        const audio = audioRefs.current[key];
        audio.pause();
        audio.removeAttribute('src');
      });

      activeTracksRef.current = activeKeys;
      const masterKey = activeKeys[0];

      activeKeys.forEach(key => {
        const audio = audioRefs.current[key];
        audio.src = sources[key];
        const volumeValue = (volumesRef.current as Record<string, number>)[key];
        audio.volume = typeof volumeValue === 'number' ? volumeValue : 1;
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        if ('preservesPitch' in audio) {
          (audio as any).preservesPitch = true;
        }

        if (key === masterKey) {
          audio.onloadedmetadata = () => {
            setDuration(audio.duration);
          };
          audio.onended = () => setIsPlaying(false);
          audio.onplay = () => setIsPlaying(true);
          audio.onpause = () => setIsPlaying(false);
        }
      });

      setIsReady(true);
    },
    [setIsPlaying, setDuration, setIsReady]
  );

  const stopAll = useCallback(() => {
    if (checkReadyRef.current) clearInterval(checkReadyRef.current);
    Object.values(audioRefs.current).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute('src');
      audio.load();
    });
    activeTracksRef.current = [];
    isWaitingForStallRef.current = false;
    setIsPlaying(false);
    lastBeatRef.current = -1;
  }, [setIsPlaying]);

  const togglePlay = useCallback(async () => {
    if (!isReady) return;

    const activeKeys = activeTracksRef.current;
    if (activeKeys.length === 0) return;
    const master = audioRefs.current[activeKeys[0]];

    if (isPlaying) {
      activeKeys.forEach(k => audioRefs.current[k].pause());
    } else {
      isWaitingForStallRef.current = false;
      const targetTime = master.currentTime;
      activeKeys.forEach(k => {
        audioRefs.current[k].currentTime = targetTime;
      });

      try {
        await Promise.all(activeKeys.map(k => audioRefs.current[k].play()));
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Playback failed:', err);
        }
      }
    }
  }, [isReady, isPlaying]);

  const handleSeek = useCallback((time: number | string) => {
    const newTime = Number(time);
    const activeKeys = activeTracksRef.current;
    
    wasPlayingRef.current = isPlaying;
    isSeekingRef.current = true;
    isWaitingForStallRef.current = false;
    
    activeKeys.forEach(k => audioRefs.current[k].pause());

    setCurrentTime(newTime);
    lastBeatRef.current = -1;
    activeKeys.forEach(k => {
      audioRefs.current[k].currentTime = newTime;
    });

    setTimeout(async () => {
      isSeekingRef.current = false;
      if (wasPlayingRef.current) {
        const currentKeys = activeTracksRef.current;
        try {
          await Promise.all(currentKeys.map(k => audioRefs.current[k].play()));
        } catch (e) {
          console.error('Seek resume failed:', e);
        }
      }
    }, 100);
  }, [isPlaying, setCurrentTime]);

  const handleVolumeChange = useCallback((track: string, val: number | string) => {
    const newVol = parseFloat(val as string);
    if (audioRefs.current[track]) {
      audioRefs.current[track].volume = newVol;
    }
  }, []);

  const handleVolumeCommit = useCallback((track: string, val: number | string) => {
    const newVol = parseFloat(val as string);
    setVolumeState(track, newVol);
  }, [setVolumeState]);

  const animate = useCallback(() => {
    const activeKeys = activeTracksRef.current;
    if (activeKeys.length === 0) {
        requestRef.current = requestAnimationFrame(animate);
        return;
    }

    const master = audioRefs.current[activeKeys[0]];
    const perfTime = performance.now();

    if (isPlaying && !isSeekingRef.current) {
        let minTime = Number.MAX_VALUE;
        let maxTime = -1;
        
        activeKeys.forEach(k => {
             const track = audioRefs.current[k];
             if (track.error) return;
             
             const t = track.currentTime;
             if (t < minTime) minTime = t;
             if (t > maxTime) maxTime = t;
        });

        if (minTime === Number.MAX_VALUE) {
            minTime = 0;
            maxTime = 0;
        }

        const spread = maxTime - minTime;

        if (spread > 0.8) {
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
                track.currentTime = minTime; // PERFECT SNAP
                if (track.paused) track.play().catch(e => {
                    if (e.name !== 'AbortError') console.debug('resume play blocked', e);
                });
            });
        }

        // throttled sync & soft catch-up (only run if not stalled)
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

        // Only update UI if we are not globally stalled and master is natively advancing
        if (!isWaitingForStallRef.current && !master.paused) {
            const rawTime = master.currentTime;

            if (rawTime !== lastAudioTime.current) {
                lastAudioTime.current = rawTime;
                lastPerfTime.current = perfTime;
            }

            // smooth UI progression
            let smoothTime = lastAudioTime.current + (perfTime - lastPerfTime.current) / 1000;
            // clamp smoothTime to prevent runaway UI playhead if audio freezes between 1s syncs
            if (smoothTime - rawTime > 0.1) smoothTime = rawTime;

            setCurrentTime(smoothTime);

            const syncTime = smoothTime + 0.02;
            if (beats && beats.length > 0) {
              const bIdx = beats.findIndex(
                (b, i) => b <= syncTime && (i === beats.length - 1 || beats[i + 1] > syncTime)
              );

              if (bIdx !== -1 && bIdx !== lastBeatRef.current) {
                lastBeatRef.current = bIdx;
                setCurrentBeatIdx(Math.round(bIdx + MASTER_BOX_OFFSET));

                const isDownbeat = bIdx % 4 === 0;
                if (isMetronome) playTick(isDownbeat);

                setBeatFlash(true);
                setTimeout(() => setBeatFlash(false), 80);
              }
            }
        }
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [beats, isMetronome, playTick, MASTER_BOX_OFFSET, setCurrentTime, setCurrentBeatIdx, setBeatFlash, isPlaying]);

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
