import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useRemixStore } from '../store/useRemixStore';

export interface RemixEngineHook {
  loadAudioSources: (sources: Record<string, string>) => void;
  stopAll: () => void;
  togglePlay: () => Promise<void>;
  handleSeek: (time: number | string) => Promise<void>;
  handleVolumeChange: (track: string, val: number | string) => void;
  handleVolumeCommit: (track: string, val: number | string) => void;
}

export const useRemixEngine = (
  beats: number[],
  isMetronome: boolean,
  playTick: (isDownbeat: boolean) => void,
  MASTER_BOX_OFFSET: number = 0
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
      const targetTime = master.currentTime;
      activeKeys.forEach(k => {
        audioRefs.current[k].currentTime = targetTime;
      });

      try {
        await Promise.all(activeKeys.map(k => audioRefs.current[k].play()));
      } catch (err) {
        console.error('Playback failed:', err);
      }
    }
  }, [isReady, isPlaying]);

  const handleSeek = useCallback(async (time: number | string) => {
    const newTime = Number(time);
    const activeKeys = activeTracksRef.current;
    
    wasPlayingRef.current = isPlaying;
    isSeekingRef.current = true;
    
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

    if (master && !master.paused && !isSeekingRef.current) {
      const rawTime = master.currentTime;

      if (rawTime !== lastAudioTime.current) {
        lastAudioTime.current = rawTime;
        lastPerfTime.current = perfTime;
      }

      const smoothTime = lastAudioTime.current + (perfTime - lastPerfTime.current) / 1000;
      setCurrentTime(smoothTime);

      // throttled sync
      if (perfTime - lastSyncTime.current > 1000) {
          activeKeys.forEach(k => {
              const track = audioRefs.current[k];
              if (track !== master) {
                  const drift = Math.abs(track.currentTime - rawTime);
                  if (drift > 0.1) { // 100ms tolerance
                      track.currentTime = rawTime;
                  }
                  if (track.paused) track.play().catch(() => {});
              }
          });
          lastSyncTime.current = perfTime;
      }

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
    requestRef.current = requestAnimationFrame(animate);
  }, [beats, isMetronome, playTick, MASTER_BOX_OFFSET, setCurrentTime, setCurrentBeatIdx, setBeatFlash]);

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
