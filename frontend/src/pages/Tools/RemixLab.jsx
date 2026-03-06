import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Menu } from 'lucide-react';
import { Client } from '@gradio/client';
import MixerControls from '../../components/remix/MixerControls.jsx';
import PlayerControls from '../../components/remix/PlayerControls.jsx';
import MetronomeSheet from '../../components/remix/MetronomeSheet.jsx';
import UploadScreen from '../../components/remix/UploadScreen.jsx';
import ChordDisplay from '../../components/remix/ChordDisplay.jsx';
import HistoryOverlay from '../../components/remix/HistoryOverlay.jsx';

// Real Metronome Samples
import drumstickWav from '../../assets/sounds/drumstick.wav';
import woodblockWav from '../../assets/sounds/woodblock.wav';
import tickWav from '../../assets/sounds/tick.wav';

const RE_MIX_API = 'https://90248f95d7afb41d14.gradio.live';

const RemixLab = ({ onExit, className }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [stemMode, setStemMode] = useState('4 Stems');
  const [stems, setStems] = useState(null);
  const [chords, setChords] = useState([]);
  const [beats, setBeats] = useState([]);
  const [tempo, setTempo] = useState(0);
  const [currentChord, setCurrentChord] = useState('');
  const [chordOffset, setChordOffset] = useState(1.0);
  const [isMetronome, setIsMetronome] = useState(false);
  const [metroSound, setMetroSound] = useState('stick');
  const [metroVolume, setMetroVolume] = useState(0.8);
  const [showMetroSheet, setShowMetroSheet] = useState(false);
  const metroSoundRef = useRef('stick');
  const metroVolumeRef = useRef(0.8);
  const [beatFlash, setBeatFlash] = useState(false);

  // Keep refs in sync with state for the animation loop
  useEffect(() => {
    metroSoundRef.current = metroSound;
    metroVolumeRef.current = metroVolume;
  }, [metroSound, metroVolume]);
  const [songName, setSongName] = useState('');
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);

  // Mixer State
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

  useEffect(() => {
    // Initialize Web Audio API for metronome ticks
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;

    // Pre-load and decode metronome samples
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
    const bufferName = soundType === 'stick' ? 'stick' : soundType === 'woodblock' ? 'woodblock' : 'digital';
    const buffer = metroBuffersRef.current[bufferName];
    
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    
    // Pitch up the downbeat (Beat 1) slightly to make it distinct
    if (isDownbeat) {
      source.playbackRate.value = 1.2;
      gain.gain.value = metroVolumeRef.current;
    } else {
      source.playbackRate.value = 1.0;
      gain.gain.value = metroVolumeRef.current * 0.6; // Slightly quieter for off-beats
    }
    
    source.start(ctx.currentTime);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input (though there aren't many here)
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

  // SMOOTH SYNC ENGINE (60 FPS)
  const animate = () => {
    const master = audioRefs.current.vocals;
    if (master) {
      const time = master.currentTime;
      setCurrentTime(time);

      // Metronome Sync Logic
      if (beats.length > 0) {
        // Find the most recently passed beat
        const currentBeatIdx = beats.findIndex(
          (b, i) => b <= time && (i === beats.length - 1 || beats[i + 1] > time)
        );

        if (currentBeatIdx !== -1 && currentBeatIdx !== lastBeatRef.current) {
          lastBeatRef.current = currentBeatIdx;
          const isDownbeat = currentBeatIdx % 4 === 0;

          if (isMetronome) {
            playTick(isDownbeat, metroSoundRef.current);
          }

          // Visual Flash Trigger
          setBeatFlash(true);
          setTimeout(() => setBeatFlash(false), 100);
        }
      }

      // Instant Chord Update logic inside the animation loop
      if (chords.length > 0) {
        // Find the chord matching the current time PLUS the user-defined offset
        const active = chords.findLast(c => c.time <= time + chordOffset);
        if (active && active.chord !== currentChord) {
          setCurrentChord(active.chord);
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
  }, [isPlaying, chords, currentChord, chordOffset]);

  useEffect(() => {
    const saved = localStorage.getItem('remix_history');
    if (saved) setHistory(JSON.parse(saved));
    return () => stopAll();
  }, []);

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

      const newStems = {
        vocals: result.data[0]?.url,
        drums: result.data[1]?.url,
        bass: result.data[2]?.url,
        other: result.data[3]?.url
      };

      // Add guitar/piano if they exist in the 6-stem response
      if (result.data[4]?.url) newStems.guitar = result.data[4].url;
      if (result.data[5]?.url) newStems.piano = result.data[5].url;

      setStems(newStems);
      setChords(result.data[6] || []);
      setBeats(result.data[7]?.beats || []);
      setTempo(Math.round(result.data[7]?.tempo || 0));
      loadAudioSources(newStems);
      saveToHistory(
        name,
        newStems,
        result.data[6] || [],
        result.data[7]?.beats || [],
        Math.round(result.data[7]?.tempo || 0)
      );
    } catch (err) {
      setError('Connection failed. Space might be offline.');
      setIsProcessing(false);
    }
  };

  const saveToHistory = (name, stemUrls, chordData, beatData, tempoVal) => {
    const newEntry = {
      id: Date.now(),
      name,
      date: new Date().toLocaleDateString(),
      stems: stemUrls,
      chords: chordData,
      beats: beatData,
      tempo: tempoVal
    };
    const updated = [newEntry, ...history].slice(0, 10);
    setHistory(updated);
    localStorage.setItem('remix_history', JSON.stringify(updated));
  };

  const loadAudioSources = sources => {
    let loadedCount = 0;
    const activeKeys = Object.keys(sources).filter(key => sources[key]);
    const totalTracks = activeKeys.length;

    activeKeys.forEach(key => {
      const audio = audioRefs.current[key];
      audio.src = sources[key];
      audio.volume = volumes[key];
      audio.crossOrigin = 'anonymous'; // Important for cloud files

      if (key === 'vocals') {
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

  const togglePlay = () => {
    if (!isReady) return;
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    if (isPlaying) Object.values(audioRefs.current).forEach(a => a.pause());
    else Object.values(audioRefs.current).forEach(a => a.play());
    setIsPlaying(!isPlaying);
  };

  const handleSeek = time => {
    const newTime = Number(time);
    setCurrentTime(newTime);
    Object.values(audioRefs.current).forEach(a => (a.currentTime = newTime));
  };

  const handleVolumeChange = (track, val) => {
    const newVol = parseFloat(val);
    setVolumes(prev => ({ ...prev, [track]: newVol }));
    audioRefs.current[track].volume = newVol;
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
      {/* Header Bar */}
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

      <main className='flex-1 flex flex-col items-center justify-center px-4 sm:px-10 w-full overflow-hidden'>
        {!stems && (
          <UploadScreen
            isProcessing={isProcessing}
            stemMode={stemMode}
            setStemMode={setStemMode}
            handleUpload={handleUpload}
          />
        )}

        {stems && (
          <>
            <ChordDisplay currentChord={currentChord} beatFlash={beatFlash} />
            <MixerControls
              stems={stems}
              volumes={volumes}
              handleVolumeChange={handleVolumeChange}
            />
          </>
        )}
      </main>

      {stems && (
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
      )}

      <MetronomeSheet 
        showMetroSheet={showMetroSheet}
        setShowMetroSheet={setShowMetroSheet}
        isMetronome={isMetronome}
        setIsMetronome={(val) => {
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
          height: 26px;
          width: 26px;
          border-radius: 50%;
          background: #3f3f46;
          border: 6px solid #18181b;
          cursor: pointer;
          box-shadow: 0 0 0 2px #3f3f46, inset 0 0 0 3px #22d3ee;
        }
        .remix-slider::-moz-range-thumb {
          height: 26px;
          width: 26px;
          border-radius: 50%;
          background: #3f3f46;
          border: 6px solid #18181b;
          cursor: pointer;
          box-shadow: 0 0 0 2px #3f3f46, inset 0 0 0 3px #22d3ee;
        }
        @media (min-width: 640px) {
          .remix-slider::-webkit-slider-thumb { height: 32px; width: 32px; border-width: 8px; box-shadow: 0 0 0 2px #3f3f46, inset 0 0 0 4px #22d3ee; }
          .remix-slider::-moz-range-thumb { height: 32px; width: 32px; border-width: 8px; box-shadow: 0 0 0 2px #3f3f46, inset 0 0 0 4px #22d3ee; }
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
