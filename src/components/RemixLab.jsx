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
  Sparkles
} from 'lucide-react';
import { Client } from '@gradio/client';

const RE_MIX_API = 'ejjays/nexstream-remix';

const RemixLab = ({ onExit }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [stems, setStems] = useState(null);
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
    other: 1
  });
  const [isReady, setIsReady] = useState(false);

  const audioRefs = useRef({
    vocals: new Audio(),
    drums: new Audio(),
    bass: new Audio(),
    other: new Audio()
  });

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
        audio_path: selectedFile
      });

      const newStems = {
        vocals: result.data[0].url,
        drums: result.data[1].url,
        bass: result.data[2].url,
        other: result.data[3].url
      };

      setStems(newStems);
      loadAudioSources(newStems);
      saveToHistory(name, newStems);
    } catch (err) {
      setError('Connection failed. Space might be offline.');
      setIsProcessing(false);
    }
  };

  const saveToHistory = (name, stemUrls) => {
    const newEntry = {
      id: Date.now(),
      name,
      date: new Date().toLocaleDateString(),
      stems: stemUrls
    };
    const updated = [newEntry, ...history].slice(0, 10);
    setHistory(updated);
    localStorage.setItem('remix_history', JSON.stringify(updated));
  };

  const loadAudioSources = sources => {
    let loadedCount = 0;
    Object.keys(sources).forEach(key => {
      const audio = audioRefs.current[key];
      audio.src = sources[key];
      audio.volume = volumes[key];
      if (key === 'vocals') {
        audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
        audio.onloadedmetadata = () => setDuration(audio.duration);
        audio.onended = () => setIsPlaying(false);
      }
      audio.oncanplaythrough = () => {
        loadedCount++;
        if (loadedCount === 4) {
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
    const rem = total - time;
    const min = Math.floor(rem / 60);
    const sec = Math.floor(rem % 60);
    return `-${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const tracks = [
    { id: 'vocals', label: 'Vocals', icon: Mic2 },
    { id: 'drums', label: 'Drums', icon: Drum },
    { id: 'bass', label: 'Bass', icon: Guitar },
    { id: 'other', label: 'Other', icon: Music }
  ];

  return (
    <div className='fixed inset-0 bg-[#000000] text-white flex flex-col z-[100] font-sans overflow-hidden'>
      {/* Header Bar - Matches Image */}
      <header className='flex items-center justify-between p-6 pt-10 px-8'>
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

      <main className='flex-1 flex flex-col items-center px-10'>
        {/* Empty State / Upload */}
        {!stems && !isProcessing && (
          <div className='flex-1 flex flex-col items-center justify-center text-center'>
            <div className='w-24 h-24 bg-zinc-900/50 rounded-full flex items-center justify-center mb-8 border border-zinc-800/50'>
              <Sparkles className='text-purple-400' size={40} />
            </div>
            <h2 className='text-2xl font-bold mb-3'>Ready to Remix?</h2>
            <p className='text-zinc-500 text-sm mb-10 max-w-[200px]'>
              Select a song to isolate instruments in high-fidelity
            </p>
            <label className='px-10 py-4 bg-white text-black rounded-full font-bold text-sm cursor-pointer hover:bg-zinc-200 transition-colors shadow-lg'>
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

        {/* Processing State */}
        {isProcessing && (
          <div className='flex-1 flex flex-col items-center justify-center'>
            <div className='relative mb-8'>
              <div className='absolute inset-0 bg-cyan-500 blur-2xl opacity-20 animate-pulse'></div>
              <Loader2
                className='text-cyan-400 animate-spin relative z-10'
                size={56}
              />
            </div>
            <p className='text-zinc-400 font-medium text-lg'>
              Isolating Tracks...
            </p>
            <p className='text-zinc-600 text-[10px] mt-3 uppercase tracking-[0.2em] font-bold'>
              Cloud AI Processing
            </p>
          </div>
        )}

        {/* Mixer List - Adaptive Spacing */}
        {stems && (
          <div className='w-full max-w-2xl space-y-8 sm:space-y-12 mt-16 sm:mt-16'>
            {tracks.map(track => (
              <div key={track.id} className='flex items-center gap-4 sm:gap-8'>
                <track.icon
                  size={24}
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
                    className='w-full h-[3px] bg-zinc-800 rounded-full appearance-none cursor-pointer outline-none remix-slider'
                    style={{
                      background: `linear-gradient(to right, #22d3ee ${
                        volumes[track.id] * 100
                      }%, #27272a ${volumes[track.id] * 100}%)`
                    }}
                  />
                </div>

                <button className='text-zinc-600 hover:text-zinc-300 transition-colors active:scale-90'>
                  <MoreVertical size={24} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer Controls - Exact Image Match */}
      {stems && (
        <footer className='p-8 pb-16 w-full max-w-3xl mx-auto flex flex-col items-center'>
          {/* Progress Slider */}
          <div className='w-full mb-4 px-2'>
            <input
              type='range'
              min='0'
              max={duration || 100}
              value={currentTime}
              onChange={e => handleSeek(e.target.value)}
              className='w-full h-[2px] bg-zinc-800 rounded-full appearance-none cursor-pointer outline-none progress-slider'
            />
            <div className='flex justify-between mt-4'>
              <span className='text-sm font-medium text-zinc-400'>
                {formatTime(currentTime)}
              </span>
              <span className='text-sm font-medium text-zinc-400'>
                {formatRemaining(currentTime, duration)}
              </span>
            </div>
          </div>

          {/* Buttons - Responsive Scaling */}
          <div className='flex items-center gap-10 sm:gap-14 mt-2 sm:mt-6'>
            <button
              onClick={() => handleSeek(0)}
              className='text-white active:opacity-50 transition-opacity'
            >
              <SkipBack
                className='w-8 h-8 sm:w-11 sm:h-11'
                fill='currentColor'
                strokeWidth={0}
              />
            </button>

            <button
              onClick={togglePlay}
              className='w-16 h-16 sm:w-24 sm:h-24 bg-white text-black rounded-full flex items-center justify-center active:scale-95 transition-all shadow-2xl'
            >
              {isPlaying ? (
                <Pause
                  className='w-8 h-8 sm:w-11 sm:h-11'
                  fill='black'
                  strokeWidth={0}
                />
              ) : (
                <Play
                  className='w-8 h-8 sm:w-11 sm:h-11 ml-1'
                  fill='black'
                  strokeWidth={0}
                />
              )}
            </button>

            <button className='text-white active:opacity-50 transition-opacity'>
              <SkipForward
                className='w-8 h-8 sm:w-11 sm:h-11'
                fill='currentColor'
                strokeWidth={0}
              />
            </button>
          </div>
        </footer>
      )}

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
            {history.length === 0 && (
              <p className='text-zinc-600 text-center mt-20'>
                No recent sessions
              </p>
            )}
            {history.map(item => (
              <div
                key={item.id}
                onClick={() => {
                  stopAll();
                  setSongName(item.name);
                  setStems(item.stems);
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

      {/* Global CSS for the Sliders */}
      <style>{`
        /* Cyan Mix Slider */
        .remix-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 22px;
          width: 22px;
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

        /* White Progress Slider */
        .progress-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(255,255,255,0.2);
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
