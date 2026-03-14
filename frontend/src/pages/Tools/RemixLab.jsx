import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Menu } from 'lucide-react';
import { Client } from '@gradio/client';
import MixerControls from '../../components/remix/MixerControls.jsx';
import PlayerControls from '../../components/remix/PlayerControls.jsx';
import MetronomeSheet from '../../components/remix/MetronomeSheet.jsx';
import UploadScreen from '../../components/remix/UploadScreen.jsx';
import ChordDisplay from '../../components/remix/ChordDisplay.jsx';
import HistoryOverlay from '../../components/remix/HistoryOverlay.jsx';
import drumstickWav from '../../assets/sounds/drumstick.wav';
import woodblockWav from '../../assets/sounds/woodblock.wav';
import tickWav from '../../assets/sounds/tick.wav';

const RE_MIX_API = 'https://8f2b53ede360521f76.gradio.live';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const MASTER_BOX_OFFSET = 0;

const RemixLab = ({ onExit, className }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [stemMode, setStemMode] = useState('4 Stems');
  const [stems, setStems] = useState(null);
  const [chords, setChords] = useState([]);
  const [beats, setBeats] = useState([]);
  const [tempo, setTempo] = useState(0);
  const [currentChord, setCurrentChord] = useState('');
  const [gridShift, setGridShift] = useState(0);
  const [isMetronome, setIsMetronome] = useState(false);
  const [currentBeatIdx, setCurrentBeatIdx] = useState(-1);
  const [metroSound, setMetroSound] = useState('stick');
  const [metroVolume, setMetroVolume] = useState(0.8);
  const [showMetroSheet, setShowMetroSheet] = useState(false);
  const metroSoundRef = useRef('stick');
  const metroVolumeRef = useRef(0.8);
  const [beatFlash, setBeatFlash] = useState(false);

  useEffect(() => {
    metroSoundRef.current = metroSound;
    metroVolumeRef.current = metroVolume;
  }, [metroSound, metroVolume]);
  const [songName, setSongName] = useState('');
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volumes, setVolumes] = useState({
    vocals: 1,
    drums: 1,
    bass: 1,
    other: 1,
    guitar: 1,
    piano: 1
  });
  const [isReady, setIsReady] = useState(false);

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
  const audioCtxRef = useRef(null);
  const metroBuffersRef = useRef({});
  const isSeekingRef = useRef(false);
  const seekTimeoutRef = useRef(null);
  const wasPlayingRef = useRef(false);

  const lastAudioTime = useRef(0);
  const lastPerfTime = useRef(0);
  const lastUIUpdate = useRef(0);

  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;

    const loadSound = async (name, url) => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        metroBuffersRef.current[name] = audioBuffer;
      } catch (err) {
        console.error(`Failed to load metronome sound: ${name}`, err);
      }
    };

    loadSound('stick', drumstickWav);
    loadSound('woodblock', woodblockWav);
    loadSound('digital', tickWav);

    return () => {
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const playTick = (isDownbeat, soundType) => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'suspended')
      return;
    const ctx = audioCtxRef.current;
    const bufferName =
      soundType === 'stick'
        ? 'stick'
        : soundType === 'woodblock'
        ? 'woodblock'
        : 'digital';
    const buffer = metroBuffersRef.current[bufferName];

    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);

    if (isDownbeat) {
      source.playbackRate.value = 1.2;
      gain.gain.value = metroVolumeRef.current;
    } else {
      source.playbackRate.value = 1.0;
      gain.gain.value = metroVolumeRef.current * 0.6;
    }

    source.start(ctx.currentTime);
  };

  useEffect(() => {
    const handleKeyDown = e => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(Math.max(0, currentTime - 5));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSeek(Math.min(duration, currentTime + 5));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isReady, currentTime, duration]);

  const animate = () => {
    const activeKey = Object.keys(audioRefs.current).find(
      k => audioRefs.current[k].src
    );
    const master = activeKey ? audioRefs.current[activeKey] : null;
    if (master && !master.paused) {
      const rawTime = master.currentTime;
      const perfTime = performance.now();

      let smoothTime = rawTime;

      if (rawTime !== lastAudioTime.current) {
        lastAudioTime.current = rawTime;
        lastPerfTime.current = perfTime;
      } else {
        smoothTime =
          lastAudioTime.current + (perfTime - lastPerfTime.current) / 1000;
      }

      if (perfTime - lastUIUpdate.current > 100) {
        setCurrentTime(smoothTime);
        lastUIUpdate.current = perfTime;
      }

      const syncTime = smoothTime + 0.05;

      if (beats.length > 0) {
        const bIdx = beats.findIndex(
          (b, i) =>
            b <= syncTime && (i === beats.length - 1 || beats[i + 1] > syncTime)
        );

        if (bIdx !== -1 && bIdx !== lastBeatRef.current) {
          lastBeatRef.current = bIdx;

          setCurrentBeatIdx(Math.round(bIdx + MASTER_BOX_OFFSET));

          const isDownbeat = bIdx % 4 === 0;
          if (isMetronome) {
            playTick(isDownbeat, metroSoundRef.current);
          }

          setBeatFlash(true);
          setTimeout(() => setBeatFlash(false), 100);
        }
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, beats, isMetronome]);

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const activeKey = Object.keys(audioRefs.current).find(
        k => audioRefs.current[k].src
      );
      const master = activeKey ? audioRefs.current[activeKey] : null;
      if (!master || master.paused || isSeekingRef.current) return;

      const masterTime = master.currentTime;

      Object.keys(audioRefs.current).forEach(key => {
        const track = audioRefs.current[key];
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

  useEffect(() => {
    fetchHistory();
    return () => stopAll();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/remix/history`);
      const data = await res.json();
      const formatted = data.map(item => {
        const fullStems = {};
        Object.keys(item.stems).forEach(k => {
          fullStems[k] = `${BACKEND_URL}${item.stems[k]}`;
        });
        return { ...item, stems: fullStems };
      });
      setHistory(formatted);
    } catch (err) {}
  };

  const stopAll = () => {
    Object.values(audioRefs.current).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    });
    setIsPlaying(false);
    setCurrentChord('');
  };

  const handleUpload = async e => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    const name = selectedFile.name.replace(/\.[^/.]+$/, '');
    setSongName(name);
    stopAll();
    setIsProcessing(true);
    setError(null);
    setStems(null);
    setIsReady(false);

    try {
      const client = await Client.connect(RE_MIX_API);
      const result = await client.predict('/remix_audio', {
        audio_path: selectedFile,
        stems_mode: stemMode
      });

      const rawStems = {
        vocals: result.data[0]?.url,
        drums: result.data[1]?.url,
        bass: result.data[2]?.url,
        other: result.data[3]?.url
      };

      if (result.data[4]?.url) rawStems.guitar = result.data[4].url;
      if (result.data[5]?.url) rawStems.piano = result.data[5].url;

      const chordsData = result.data[6] || [];
      const beatsData = result.data[7]?.beats || [];
      const tempoVal = Math.round(result.data[7]?.tempo || 0);

      const saveRes = await fetch(`${BACKEND_URL}/api/remix/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `${Date.now()}-${name.substring(0, 10)}`,
          name,
          stems: rawStems,
          chords: chordsData,
          beats: beatsData,
          tempo: tempoVal
        })
      });

      const { localStems } = await saveRes.json();
      const finalStems = {};
      Object.keys(localStems).forEach(k => {
        finalStems[k] = `${BACKEND_URL}${localStems[k]}`;
      });

      setStems(finalStems);
      setChords(chordsData);
      setBeats(beatsData);
      setTempo(tempoVal);
      loadAudioSources(finalStems);
      fetchHistory();
    } catch (err) {
      setError('Connection failed. Space might be offline.');
      setIsProcessing(false);
    }
  };

  const loadAudioSources = sources => {
    let loadedCount = 0;
    const activeKeys = Object.keys(sources).filter(key => sources[key]);
    const totalTracks = activeKeys.length;
    const masterKey = activeKeys[0];

    activeKeys.forEach(key => {
      const audio = audioRefs.current[key];
      audio.src = sources[key];
      audio.volume = volumes[key];
      audio.crossOrigin = 'anonymous';

      if (key === masterKey) {
        audio.onloadedmetadata = () => setDuration(audio.duration);
        audio.onended = () => setIsPlaying(false);
      }

      audio.oncanplaythrough = () => {
        loadedCount++;
        if (loadedCount === totalTracks) {
          setIsReady(true);
          setIsProcessing(false);
        }
      };
    });
  };

  const togglePlay = async () => {
    if (!isReady) return;

    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    if (isPlaying) {
      Object.values(audioRefs.current).forEach(a => a.pause());
      setIsPlaying(false);
    } else {
      const activeKey = Object.keys(audioRefs.current).find(
        k => audioRefs.current[k].src
      );
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

  const handleSeek = async time => {
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
          const activeKey = Object.keys(audioRefs.current).find(
            k => audioRefs.current[k].src
          );
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

  const formatTime = time => {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const formatRemaining = (time, total) => {
    const rem = Math.max(0, total - time);
    const min = Math.floor(rem / 60);
    const sec = Math.floor(rem % 60);
    return `-${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className='fixed inset-0 bg-[#000000] text-white flex flex-col z-[100] font-sans overflow-hidden'>
      <header className='flex items-center justify-between p-4 sm:p-6 pt-2 sm:pt-4 px-6 sm:px-8 shrink-0'>
        <button
          onClick={onExit}
          className='active:scale-90 transition-transform'
        >
          <ChevronDown size={32} strokeWidth={1.2} />
        </button>
        <h1 className='text-lg font-normal truncate max-w-[65%] text-center text-zinc-100'>
          {stems ? songName : 'Remix Studio'}
        </h1>
        <button
          onClick={() => setShowHistory(true)}
          className='active:scale-90 transition-transform'
        >
          <Menu size={32} strokeWidth={1.2} />
        </button>
      </header>

      <main className='flex-1 flex flex-col items-center min-h-0 overflow-hidden relative'>
        {!stems && (
          <div className='flex-1 flex items-center justify-center w-full'>
            <UploadScreen
              isProcessing={isProcessing}
              stemMode={stemMode}
              setStemMode={setStemMode}
              handleUpload={handleUpload}
            />
          </div>
        )}

        {stems && (
          <div className='flex-1 w-full flex flex-col items-center justify-between min-h-0 overflow-hidden'>
            <div className='w-full shrink-0 pt-2 sm:pt-4'>
              <ChordDisplay
                chords={chords}
                beats={beats}
                currentTime={currentTime}
                currentBeatIdx={currentBeatIdx}
                gridShift={gridShift}
                beatFlash={beatFlash}
              />
            </div>

            <div className='w-full flex-1 flex justify-center px-4 sm:px-10 min-h-0 overflow-y-auto scrollbar-none py-4'>
              <MixerControls
                stems={stems}
                volumes={volumes}
                handleVolumeChange={handleVolumeChange}
                handleVolumeCommit={handleVolumeCommit}
              />
            </div>

            <div className='w-full shrink-0'>
              <PlayerControls
                duration={duration}
                currentTime={currentTime}
                handleSeek={handleSeek}
                formatTime={formatTime}
                formatRemaining={formatRemaining}
                isPlaying={isPlaying}
                togglePlay={togglePlay}
                onReset={() => {
                  stopAll();
                  setStems(null);
                }}
                isMetronome={isMetronome}
                setShowMetroSheet={setShowMetroSheet}
              />
            </div>
          </div>
        )}
      </main>

      <MetronomeSheet
        showMetroSheet={showMetroSheet}
        setShowMetroSheet={setShowMetroSheet}
        isMetronome={isMetronome}
        setIsMetronome={val => {
          if (audioCtxRef.current?.state === 'suspended') {
            audioCtxRef.current.resume();
          }
          setIsMetronome(val);
        }}
        tempo={tempo}
        metroVolume={metroVolume}
        setMetroVolume={setMetroVolume}
        metroSound={metroSound}
        setMetroSound={setMetroSound}
        gridShift={gridShift}
        setGridShift={setGridShift}
      />
      <HistoryOverlay
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        history={history}
        onRestore={item => {
          stopAll();
          setSongName(item.name);
          setStems(item.stems);
          setChords(item.chords || []);
          setBeats(item.beats || []);
          setTempo(item.tempo || 0);
          loadAudioSources(item.stems);
        }}
      />

      <style>{`
        .remix-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #18181b;
          cursor: pointer;
          border: 1px solid #000000;
          box-shadow: inset 0 0 0 4px #22d3ee;
        }
        .remix-slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #18181b;
          cursor: pointer;
          border: 1px solid #000000;
          box-shadow: inset 0 0 0 4px #22d3ee;
        }
        @media (min-width: 640px) {
          .remix-slider::-webkit-slider-thumb { 
            height: 32px; 
            width: 32px; 
            background: #3f3f46;
            border: 8px solid #18181b; 
            box-shadow: 0 0 0 2px #3f3f46, inset 0 0 0 4px #22d3ee; 
          }
          .remix-slider::-moz-range-thumb { 
            height: 32px; 
            width: 32px; 
            background: #3f3f46;
            border: 8px solid #18181b; 
            box-shadow: 0 0 0 2px #3f3f46, inset 0 0 0 4px #22d3ee; 
          }
        }
        .progress-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
        }
        .progress-slider::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

export default RemixLab;
