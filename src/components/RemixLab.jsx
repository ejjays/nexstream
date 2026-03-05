import { useState, useRef, useEffect } from 'react';
import {
  Mic2,
  Drum,
  Guitar,
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  Menu,
  MoreVertical,
  Loader2,
  X,
  Sparkles,
  RotateCcw,
  Metronome,
  Piano
} from 'lucide-react';
import { Client } from '@gradio/client';

const RE_MIX_API = 'https://ffeef187371cf0cedd.gradio.live';

const RemixLab = ({ onExit, className }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [stemMode, setStemMode] = useState('4 Stems');
  const [stems, setStems] = useState(null);
  const [chords, setChords] = useState([]);
  const [beats, setBeats] = useState([]);
  const [currentChord, setCurrentChord] = useState('');
  const [chordOffset, setChordOffset] = useState(1.0); 
  const [isMetronome, setIsMetronome] = useState(false);
  const [metroSound, setMetroSound] = useState('stick');
  const [showMetroSheet, setShowMetroSheet] = useState(false);
  const metroSoundRef = useRef('stick');
  const [beatFlash, setBeatFlash] = useState(false);

  // Keep ref in sync with state for the animation loop
  useEffect(() => {
    metroSoundRef.current = metroSound;
  }, [metroSound]);
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

  useEffect(() => {
    // Initialize Web Audio API for metronome ticks
    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return () => {
      if (audioCtxRef.current) audioCtxRef.current.close();
    }
  }, []);

  const playTick = (isDownbeat, soundType) => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'suspended') return;
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    if (soundType === 'digital') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = isDownbeat ? 1200 : 800;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (soundType === 'woodblock') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(isDownbeat ? 800 : 600, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.8, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (soundType === 'stick') {
      // Noise burst for a sharp drumstick click
      const bufferSize = ctx.sampleRate * 0.05; // 50ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = isDownbeat ? 4000 : 3000;
      filter.Q.value = 1.5;

      const gain = ctx.createGain();
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      
      noise.start(now);
      noise.stop(now + 0.05);
    }
  };

  // SMOOTH SYNC ENGINE (60 FPS)
  const animate = () => {
    const master = audioRefs.current.vocals;
    if (master) {
      const time = master.currentTime;
      setCurrentTime(time);

      // Metronome Sync Logic
      if (beats.length > 0) {
        // Find the most recently passed beat
        const currentBeatIdx = beats.findIndex((b, i) => b <= time && (i === beats.length - 1 || beats[i+1] > time));
        
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
        const active = chords.findLast(c => c.time <= (time + chordOffset));
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
        other: result.data[3]?.url,
      };
      
      // Add guitar/piano if they exist in the 6-stem response
      if (result.data[4]?.url) newStems.guitar = result.data[4].url;
      if (result.data[5]?.url) newStems.piano = result.data[5].url;

      setStems(newStems);
      setChords(result.data[6] || []);
      setBeats(result.data[7]?.beats || []);
      loadAudioSources(newStems);
      saveToHistory(name, newStems, result.data[6] || [], result.data[7]?.beats || []);
    } catch (err) {
      setError('Connection failed. Space might be offline.');
      setIsProcessing(false);
    }
  };

  const saveToHistory = (name, stemUrls, chordData, beatData) => {
    const newEntry = {
      id: Date.now(),
      name,
      date: new Date().toLocaleDateString(),
      stems: stemUrls,
      chords: chordData,
      beats: beatData
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

  const allTracks = [
    { id: 'vocals', label: 'Vocals', icon: Mic2 },
    { id: 'drums', label: 'Drums', icon: Drum },
    { id: 'bass', label: 'Bass', icon: Guitar },
    { id: 'guitar', label: 'Guitar', icon: Guitar },
    { id: 'piano', label: 'Piano', icon: Piano },
    { id: 'other', label: 'Other', icon: Music }
  ];

  const activeTracks = stems ? allTracks.filter(t => stems[t.id]) : [];

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
        {!stems && !isProcessing && (
          <div className='flex-1 flex flex-col items-center justify-center text-center w-full max-w-sm mx-auto'>
            <div className='w-16 h-16 sm:w-24 sm:h-24 bg-zinc-900/50 rounded-full flex items-center justify-center mb-4 sm:mb-8 border border-zinc-800/50 mx-auto'>
              <Sparkles className='text-purple-400' size={28} />
            </div>
            <h2 className='text-xl sm:text-2xl font-bold mb-2 sm:mb-3'>AI Composer</h2>
            <p className='text-zinc-500 text-xs sm:text-sm mb-6 sm:mb-8 max-w-[240px] mx-auto'>
              Isolate tracks & detect chords with Viterbi sync
            </p>
            
            {/* Stem Selection */}
            <div className='flex bg-zinc-900/80 p-1 rounded-xl mb-6 sm:mb-8 w-full border border-zinc-800/50 shadow-inner'>
              <button
                onClick={() => setStemMode('4 Stems')}
                className={`flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-bold rounded-lg transition-all ${stemMode === '4 Stems' ? 'bg-cyan-500 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                4 Tracks
                <span className='block text-[9px] font-normal opacity-80 mt-0.5'>Standard</span>
              </button>
              <button
                onClick={() => setStemMode('6 Stems')}
                className={`flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-bold rounded-lg transition-all ${stemMode === '6 Stems' ? 'bg-cyan-500 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                6 Tracks
                <span className='block text-[9px] font-normal opacity-80 mt-0.5'>+ Guitar & Piano</span>
              </button>
            </div>

            <label className='w-full py-3 sm:py-4 bg-white text-black rounded-xl font-bold text-sm sm:text-base cursor-pointer hover:bg-zinc-200 transition-colors mx-auto'>
              Select Audio File
              <input
                type='file'
                accept='audio/*'
                className='hidden'
                onChange={handleUpload}
              />
            </label>
          </div>
        )}

        {isProcessing && (
          <div className='flex-1 flex flex-col items-center justify-center'>
            <Loader2 className='text-cyan-400 animate-spin mb-4' size={40} />
            <p className='text-zinc-400 font-medium text-sm sm:text-lg'>
              AI is analyzing...
            </p>
          </div>
        )}

        {/* CHORD DISPLAY - HIGH ACCURACY */}
        {stems && (
          <div className='flex flex-col items-center justify-center pt-0 pb-4 sm:pt-0 sm:pb-8 shrink-0'>
            <div className='flex items-center gap-2 mb-1'>
              <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full transition-all duration-100 ${beatFlash ? 'bg-cyan-400 scale-150 shadow-[0_0_12px_rgba(34,211,238,0.8)]' : 'bg-zinc-800'}`} />
              <div className='text-zinc-500 text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.3em]'>
                Beat-Synced Chord
              </div>
            </div>
            <div className='text-5xl sm:text-7xl font-black text-cyan-400 tracking-tighter transition-all duration-150 scale-105'>
              {currentChord || '...'}
            </div>
          </div>
        )}

        {/* Mixer List */}
        {stems && (
          <div className='w-full max-w-2xl flex flex-col justify-center space-y-4 sm:space-y-8 mt-2 sm:mt-4 px-2 sm:px-0 shrink-0'>
            {activeTracks.map(track => (
              <div key={track.id} className='flex items-center gap-3 sm:gap-6'>
                <track.icon
                  size={20}
                  className='text-white shrink-0 sm:w-7 sm:h-7'
                  strokeWidth={1.2}
                />
                <div className='flex-1 relative flex items-center'>
                  <input
                    type='range'
                    min='0'
                    max='1'
                    step='0.01'
                    value={volumes[track.id]}
                    onChange={e => handleVolumeChange(track.id, e.target.value)}
                    className='w-full h-[2px] sm:h-[3px] bg-zinc-800 rounded-full appearance-none cursor-pointer outline-none remix-slider'
                    style={{
                      background: `linear-gradient(to right, #22d3ee ${
                        volumes[track.id] * 100
                      }%, #27272a ${volumes[track.id] * 100}%)`
                    }}
                  />
                </div>
                <button className='text-zinc-600 hover:text-zinc-300 transition-colors'>
                  <MoreVertical size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer Controls */}
      {stems && (
        <footer className='p-4 sm:p-6 pb-6 sm:pb-10 w-full max-w-3xl mx-auto flex flex-col items-center shrink-0 bg-black'>
          <div className='w-full mb-2 sm:mb-4 px-2'>
            <input
              type='range'
              min='0'
              max={duration || 100}
              value={currentTime}
              onChange={e => handleSeek(e.target.value)}
              className='w-full h-[2px] bg-zinc-800 rounded-full appearance-none cursor-pointer outline-none progress-slider'
            />
            <div className='flex justify-between mt-2 sm:mt-4'>
              <span className='text-[10px] sm:text-xs font-medium text-zinc-400'>
                {formatTime(currentTime)}
              </span>
              <span className='text-[10px] sm:text-xs font-medium text-zinc-400'>
                {formatRemaining(currentTime, duration)}
              </span>
            </div>
          </div>

          <div className='flex items-center justify-center gap-6 sm:gap-14 mt-1 sm:mt-4 w-full relative'>
            <div className='absolute left-0 flex items-center'>
              <button 
                onClick={() => setShowMetroSheet(true)}
                className={`p-2 rounded-full transition-colors ${isMetronome ? 'text-cyan-400 bg-cyan-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <Metronome size={24} className='sm:w-8 sm:h-8' />
              </button>
            </div>

            <button onClick={() => handleSeek(0)} className='text-white'>
              <SkipBack
                className='w-6 h-6 sm:w-10 sm:h-10'
                fill='currentColor'
                strokeWidth={0}
              />
            </button>

            <button
              onClick={togglePlay}
              className='w-14 h-14 sm:w-20 sm:h-20 bg-white text-black rounded-full flex items-center justify-center shadow-2xl shrink-0'
            >
              {isPlaying ? (
                <Pause
                  className='w-6 h-6 sm:w-10 sm:h-10'
                  fill='black'
                  strokeWidth={0}
                />
              ) : (
                <Play
                  className='w-6 h-6 sm:w-10 sm:h-10 ml-1'
                  fill='black'
                  strokeWidth={0}
                />
              )}
            </button>

            <button
              onClick={() => {
                stopAll();
                setStems(null);
              }}
              className='text-white'
            >
              <RotateCcw
                className='w-6 h-6 sm:w-10 sm:h-10 text-zinc-600'
                strokeWidth={1.5}
              />
            </button>
          </div>
        </footer>
      )}

      {/* Metronome Bottom Sheet */}
      <div 
        className={`fixed inset-0 bg-black/60 z-[105] backdrop-blur-sm transition-opacity duration-300 ${showMetroSheet ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
        onClick={() => setShowMetroSheet(false)} 
      />
      <div 
        className={`fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-[32px] p-6 pb-10 z-[110] transition-transform duration-300 ease-out flex flex-col max-w-xl mx-auto shadow-2xl ${showMetroSheet ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* Handle Pill */}
        <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto mb-6 shrink-0" />
        
        <div className="flex justify-center items-center mb-8">
          <h3 className="text-xl font-bold flex items-center gap-2.5">
            <Metronome size={24} className={isMetronome ? "text-cyan-400" : "text-zinc-500"} />
            Smart Metronome
          </h3>
        </div>
        
        <div className="flex items-center justify-between bg-zinc-800/40 p-5 rounded-2xl mb-6 border border-zinc-800/50">
          <div className="flex flex-col">
            <span className="font-bold text-base">Enable Click Track</span>
            <span className="text-xs text-zinc-500">Perfect beat-sync synchronization</span>
          </div>
          <button
            onClick={() => setIsMetronome(!isMetronome)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${isMetronome ? 'bg-cyan-500' : 'bg-zinc-700'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${isMetronome ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className={`transition-all duration-300 ${isMetronome ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <span className="text-xs text-zinc-400 font-bold uppercase tracking-widest mb-4 block px-1">Sound Signature</span>
          <div className="grid grid-cols-3 gap-3">
            {['stick', 'woodblock', 'digital'].map((sound) => (
              <button
                key={sound}
                onClick={() => setMetroSound(sound)}
                className={`py-4 px-2 rounded-2xl text-xs font-bold capitalize transition-all border ${metroSound === sound ? 'bg-cyan-500 border-cyan-400 text-white shadow-lg shadow-cyan-500/20' : 'bg-zinc-800/50 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
              >
                {sound}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* History Slide-over */}
      {showHistory && (
        <div className='absolute inset-0 bg-black z-[110] p-10 flex flex-col animate-in slide-in-from-right duration-300'>
          <div className='flex items-center justify-between mb-12'>
            <h3 className='text-2xl font-bold'>History</h3>
            <button
              onClick={() => setShowHistory(false)}
              className='p-2 bg-zinc-900 rounded-full'
            >
              <X size={24} />
            </button>
          </div>
          <div className='flex-1 overflow-y-auto space-y-4'>
            {history.map(item => (
              <div
                key={item.id}
                onClick={() => {
                  stopAll();
                  setSongName(item.name);
                  setStems(item.stems);
                  setChords(item.chords || []);
                  setBeats(item.beats || []);
                  loadAudioSources(item.stems);
                  setShowHistory(false);
                }}
                className='p-5 bg-zinc-900/50 rounded-3xl border border-zinc-800/50 flex justify-between items-center cursor-pointer hover:bg-zinc-800 transition-colors'
              >
                <div className='flex flex-col overflow-hidden mr-4'>
                  <span className='text-base font-semibold truncate'>
                    {item.name}
                  </span>
                  <span className='text-xs text-zinc-500 mt-1'>
                    {item.date}
                  </span>
                </div>
                <div className='w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-cyan-400'>
                  <Play size={16} fill='currentColor' />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
