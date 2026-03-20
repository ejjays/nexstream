import { useState, useRef, useEffect, useCallback } from 'react';

export const useRemixEngine = (beats, isMetronome, playTick, MASTER_BOX_OFFSET = 0) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentBeatIdx, setCurrentBeatIdx] = useState(-1);
  const [beatFlash, setBeatFlash] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [volumes, setVolumes] = useState({
    vocals: 1, drums: 1, bass: 1, other: 1, guitar: 1, piano: 1
  });

  const audioRefs = useRef({
    vocals: new Audio(),
    drums: new Audio(),
    bass: new Audio(),
    other: new Audio(),
    guitar: new Audio(),
    piano: new Audio()
  });

  const requestRef = useRef();
  const lastBeatRef = useRef(-1);
  const isSeekingRef = useRef(false);
  const seekTimeoutRef = useRef(null);
  const wasPlayingRef = useRef(false);

  const lastAudioTime = useRef(0);
  const lastPerfTime = useRef(0);
  const lastUIUpdate = useRef(0);

  const loadAudioSources = useCallback((sources) => {
    let loadedCount = 0;
    const activeKeys = Object.keys(sources).filter(key => sources[key]);
    const totalTracks = activeKeys.length;
    if (totalTracks === 0) return;
    const masterKey = activeKeys[0];

    setIsReady(false);

    activeKeys.forEach(key => {
      const audio = audioRefs.current[key];

      audio.onloadedmetadata = null;
      audio.onended = null;
      audio.oncanplaythrough = null;
      audio.onloadeddata = null;

      audio.src = sources[key];
      audio.volume = volumes[key];
      audio.crossOrigin = 'anonymous';
      audio.load();

      if (key === masterKey) {
        audio.onloadedmetadata = () => setDuration(audio.duration);
        audio.onended = () => setIsPlaying(false);
      }

      const handleLoad = () => {
        loadedCount++;
        if (loadedCount === totalTracks) {
          setIsReady(true);
        }
      };

      let hasFired = false;
      const fireOnce = () => {
        if (!hasFired) {
          hasFired = true;
          handleLoad();
        }
      };

      audio.oncanplaythrough = fireOnce;
      audio.oncanplay = fireOnce;
      audio.onloadeddata = fireOnce;
    });
  }, [volumes]);

  const stopAll = useCallback(() => {
    Object.values(audioRefs.current).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    });
    setIsPlaying(false);
    lastBeatRef.current = -1;
  }, []);

  const togglePlay = async () => {
    if (!isReady) return;

    if (isPlaying) {
      Object.values(audioRefs.current).forEach(a => a.pause());
      setIsPlaying(false);
    } else {
      const activeKey = Object.keys(audioRefs.current).find(k => audioRefs.current[k].src);
      const master = activeKey ? audioRefs.current[activeKey] : null;
      if (!master) return;
      const targetTime = master.currentTime;

      Object.values(audioRefs.current).forEach(a => {
        if (a.src) a.currentTime = targetTime;
      });

      const playPromises = Object.values(audioRefs.current)
        .filter(a => a.src)
        .map(a => a.play());

      try {
        await Promise.all(playPromises);
        setIsPlaying(true);
      } catch (err) {
        console.error('Playback error in togglePlay', err);
        if (master && !master.paused) {
          setIsPlaying(true);
        }
      }
    }
  };

  const handleSeek = async (time) => {
    const newTime = Number(time);

    if (!isSeekingRef.current) {
      wasPlayingRef.current = isPlaying;
      isSeekingRef.current = true;
    }

    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
    }

    Object.values(audioRefs.current).forEach(a => a.pause());
    setIsPlaying(false);

    setCurrentTime(newTime);
    lastBeatRef.current = -1;

    Object.values(audioRefs.current).forEach(a => {
      if (a.src) a.currentTime = newTime;
    });

    seekTimeoutRef.current = setTimeout(async () => {
      seekTimeoutRef.current = null;
      isSeekingRef.current = false;

      if (wasPlayingRef.current) {
        try {
          const playPromises = Object.values(audioRefs.current)
            .filter(a => a.src)
            .map(a => a.play());
          await Promise.all(playPromises);
          setIsPlaying(true);
        } catch (err) {
          console.error('Playback error during seek recovery', err);
          const activeKey = Object.keys(audioRefs.current).find(k => audioRefs.current[k].src);
          const master = activeKey ? audioRefs.current[activeKey] : null;
          if (master && !master.paused) {
            setIsPlaying(true);
          }
        }
      }
    }, 150);
  };

  const handleVolumeChange = (track, val) => {
    const newVol = parseFloat(val);
    if (audioRefs.current[track]) {
      audioRefs.current[track].volume = newVol;
    }
  };

  const handleVolumeCommit = (track, val) => {
    const newVol = parseFloat(val);
    setVolumes(prev => ({ ...prev, [track]: newVol }));
  };

  const animate = useCallback(() => {
    const activeKey = Object.keys(audioRefs.current).find(k => audioRefs.current[k].src);
    const master = activeKey ? audioRefs.current[activeKey] : null;
    
    if (master && !master.paused) {
      const rawTime = master.currentTime;
      const perfTime = performance.now();

      let smoothTime = rawTime;

      if (rawTime !== lastAudioTime.current) {
        lastAudioTime.current = rawTime;
        lastPerfTime.current = perfTime;
      } else {
        smoothTime = lastAudioTime.current + (perfTime - lastPerfTime.current) / 1000;
      }

      if (perfTime - lastUIUpdate.current > 100) {
        setCurrentTime(smoothTime);
        lastUIUpdate.current = perfTime;
      }

      const syncTime = smoothTime + 0.05;

      if (beats && beats.length > 0) {
        const bIdx = beats.findIndex(
          (b, i) => b <= syncTime && (i === beats.length - 1 || beats[i + 1] > syncTime)
        );

        if (bIdx !== -1 && bIdx !== lastBeatRef.current) {
          lastBeatRef.current = bIdx;
          setCurrentBeatIdx(Math.round(bIdx + MASTER_BOX_OFFSET));

          const isDownbeat = bIdx % 4 === 0;
          if (isMetronome && playTick) {
            playTick(isDownbeat);
          }

          setBeatFlash(true);
          setTimeout(() => setBeatFlash(false), 100);
        }
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [beats, isMetronome, playTick, MASTER_BOX_OFFSET]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, animate]);

  // Drift correction
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const activeKey = Object.keys(audioRefs.current).find(k => audioRefs.current[k].src);
      const master = activeKey ? audioRefs.current[activeKey] : null;
      if (!master || master.paused || isSeekingRef.current) return;

      const masterTime = master.currentTime;

      Object.values(audioRefs.current).forEach(track => {
        if (track && track !== master && track.src) {
          const drift = Math.abs(track.currentTime - masterTime);
          if (drift > 0.2) {
            track.currentTime = masterTime;
          }
        }
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isPlaying]);

  return {
    isPlaying, duration, currentTime, volumes, isReady, currentBeatIdx, beatFlash,
    loadAudioSources, stopAll, togglePlay, handleSeek, handleVolumeChange, handleVolumeCommit
  };
};
