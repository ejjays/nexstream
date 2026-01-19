import { useState, useRef, useEffect } from 'react';
import { Upload, Mic2, Music2, Drum, Speaker, Loader2, Sparkles, ArrowLeft, Play, Pause, SkipBack, Volume2, VolumeX, History, RotateCcw, Trash2 } from 'lucide-react';
import { Client } from "@gradio/client";

// YOUR CLOUD ENGINE URL
const RE_MIX_API = "ejjays/nexstream-remix"; 

const RemixLab = ({ onExit }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [stems, setStems] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // Mixer State
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volumes, setVolumes] = useState({ vocals: 1, drums: 1, bass: 1, other: 1 });
  const [muted, setMuted] = useState({ vocals: false, drums: false, bass: false, other: false });
  const [isReady, setIsReady] = useState(false);

  // Audio Refs
  const audioRefs = useRef({
    vocals: new Audio(),
    drums: new Audio(),
    bass: new Audio(),
    other: new Audio()
  });

  // Load history from LocalStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('remix_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history");
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAll();
    };
  }, []);

  const saveToHistory = (name, stemUrls) => {
    const newEntry = {
      id: Date.now(),
      name: name,
      date: new Date().toLocaleDateString(),
      stems: stemUrls
    };
    
    // Keep only last 10 items
    const updated = [newEntry, ...history].slice(0, 10);
    setHistory(updated);
    localStorage.setItem('remix_history', JSON.stringify(updated));
  };

  const deleteHistoryItem = (e, id) => {
    e.stopPropagation();
    const updated = history.filter(item => item.id !== id);
    setHistory(updated);
    localStorage.setItem('remix_history', JSON.stringify(updated));
  };

  const stopAll = () => {
    Object.values(audioRefs.current).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
      audio.src = "";
    });
    setIsPlaying(false);
  };

  const handleUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    stopAll();
    setIsProcessing(true);
    setError(null);
    setStems(null);
    setIsReady(false);
    setShowHistory(false); // Close history panel

    try {
      const client = await Client.connect(RE_MIX_API);
      const result = await client.predict("/remix_audio", { 
        audio_path: selectedFile, 
      });

      const newStems = {
        vocals: result.data[0].url,
        drums: result.data[1].url,
        bass: result.data[2].url,
        other: result.data[3].url
      };

      setStems(newStems);
      loadAudioSources(newStems);
      
      // Save to history
      saveToHistory(selectedFile.name.replace(/\.[^/.]+$/, ""), newStems);

    } catch (err) {
      setError('Cloud processing failed. The space might be sleeping or busy.');
      console.error(err);
      setIsProcessing(false);
    }
  };

  const loadAudioSources = (sources) => {
    let loadedCount = 0;
    
    Object.keys(sources).forEach(key => {
      const audio = audioRefs.current[key];
      audio.src = sources[key];
      audio.volume = volumes[key];
      
      // Sync Logic: Use Vocals as the "Master" for time updates
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
      
      // Handle loading errors (expired links)
      audio.onerror = () => {
        setError("Link expired. Please remix this song again.");
        setIsProcessing(false);
      };
    });
  };

  const restoreSession = (item) => {
    stopAll();
    setStems(item.stems);
    setIsReady(false); // Will become true when audio loads
    setIsProcessing(true); // Show loader briefly while buffering
    setError(null);
    setShowHistory(false);
    loadAudioSources(item.stems);
  };

  const togglePlay = () => {
    if (!isReady) return;

    if (isPlaying) {
      Object.values(audioRefs.current).forEach(audio => audio.pause());
    } else {
      Object.values(audioRefs.current).forEach(audio => audio.play());
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    Object.values(audioRefs.current).forEach(audio => audio.currentTime = newTime);
  };

  const handleVolumeChange = (track, val) => {
    const newVol = parseFloat(val);
    setVolumes(prev => ({ ...prev, [track]: newVol }));
    if (!muted[track]) {
      audioRefs.current[track].volume = newVol;
    }
  };

  const toggleMute = (track) => {
    const newMuteState = !muted[track];
    setMuted(prev => ({ ...prev, [track]: newMuteState }));
    audioRefs.current[track].volume = newMuteState ? 0 : volumes[track];
  };

  const formatTime = (time) => {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const tracks = [
    { id: 'vocals', label: 'Vocals', icon: Mic2, color: 'text-pink-400', border: 'border-pink-500/30', bg: 'bg-pink-500' },
    { id: 'drums', label: 'Drums', icon: Drum, color: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-500' },
    { id: 'bass', label: 'Bass', icon: Speaker, color: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500' },
    { id: 'other', label: 'Other', icon: Music2, color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500' },
  ];

  return (
    <div className='w-full h-full flex flex-col items-center p-4 relative animate-in fade-in duration-500'>
      
      {/* Top Bar */}
      <div className='w-full flex items-center justify-between mb-6 z-50'>
        <button 
          onClick={onExit}
          className='p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all backdrop-blur-md'
        >
          <ArrowLeft size={20} />
        </button>
        
        {stems && (
           <span className='px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold uppercase tracking-widest border border-purple-500/30'>
             Studio Mode
           </span>
        )}

        <button 
          onClick={() => setShowHistory(!showHistory)}
          className={`p-2 rounded-full ${showHistory ? 'bg-purple-500 text-white' : 'bg-white/5 text-gray-400'} hover:bg-purple-500/50 hover:text-white transition-all backdrop-blur-md`}
        >
          <History size={20} />
        </button>
      </div>

      {/* History Overlay */}
      {showHistory && (
        <div className='absolute inset-0 z-40 bg-gray-950/90 backdrop-blur-xl flex flex-col pt-20 px-4 pb-4 animate-in fade-in zoom-in-95 duration-200'>
          <h3 className='text-xl font-bold text-white mb-4 ml-2'>Recent Sessions</h3>
          <div className='flex-1 overflow-y-auto space-y-2 pr-2'>
            {history.length === 0 ? (
              <p className='text-gray-500 text-center mt-10'>No history yet.</p>
            ) : (
              history.map(item => (
                <div 
                  key={item.id}
                  onClick={() => restoreSession(item)}
                  className='p-4 bg-gray-800/50 hover:bg-gray-800 rounded-2xl border border-gray-700/50 flex items-center justify-between group cursor-pointer transition-all'
                >
                  <div className='flex items-center gap-3 overflow-hidden'>
                    <div className='p-2 bg-purple-500/20 rounded-full text-purple-400'>
                      <Music2 size={16} />
                    </div>
                    <div className='flex flex-col overflow-hidden'>
                      <span className='text-sm text-gray-200 font-medium truncate'>{item.name}</span>
                      <span className='text-xs text-gray-500'>{item.date}</span>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => deleteHistoryItem(e, item.id)}
                    className='p-2 text-gray-600 hover:text-red-400 transition-colors'
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Hero Section */}
      {!stems && !isProcessing && !showHistory && (
        <div className='flex flex-col items-center text-center max-w-md w-full mt-12'>
          <div className='inline-block p-4 rounded-3xl bg-purple-500/10 border border-purple-500/20 mb-6 animate-pulse'>
            <Sparkles className='text-purple-400' size={40} />
          </div>
          <h2 className='text-3xl font-bold text-white mb-2 tracking-tight'>Remix Studio</h2>
          <p className='text-gray-400 mb-8'>Pro AI Mixer: Isolate & Control Stems</p>

          <label className='w-full aspect-[3/1] flex flex-col items-center justify-center border-2 border-dashed border-gray-700/50 rounded-2xl hover:border-purple-500/50 hover:bg-purple-500/5 transition-all cursor-pointer group bg-gray-900/30'>
            <div className='flex items-center gap-3 text-gray-400 group-hover:text-purple-400 transition-colors'>
              <Upload size={20} />
              <span className='font-medium'>Tap to Upload Song</span>
            </div>
            <span className='text-gray-600 text-xs mt-2'>MP3, WAV, M4A • Cloud Powered</span>
            <input type='file' accept='audio/*' className='hidden' onChange={handleUpload} />
          </label>
        </div>
      )}

      {/* Loading State */}
      {isProcessing && (
        <div className='flex flex-col items-center justify-center mt-20'>
          <div className='relative'>
            <div className='absolute inset-0 bg-purple-500 blur-xl opacity-20 animate-pulse'></div>
            <Loader2 className='text-purple-400 animate-spin relative z-10' size={64} />
          </div>
          <p className='text-white font-medium mt-6 text-lg'>Separating Stems...</p>
          <p className='text-gray-500 text-sm mt-2'>Preparing Mixer Console...</p>
        </div>
      )}

      {/* MIXER INTERFACE */}
      {stems && !showHistory && (
        <div className='w-full max-w-lg flex flex-col gap-6 animate-in slide-in-from-bottom-8 duration-700'>
          
          {/* Visualizer / Time Display */}
          <div className='flex flex-col items-center justify-center py-4'>
             <h3 className='text-3xl font-mono font-bold text-white tracking-widest'>
               {formatTime(currentTime)}
             </h3>
             <p className='text-gray-500 text-xs mt-1 font-mono'>/ {formatTime(duration)}</p>
          </div>

          {/* Faders Grid */}
          <div className='grid grid-cols-4 gap-2 h-64'>
            {tracks.map((track) => (
              <div key={track.id} className={`relative flex flex-col items-center justify-end p-2 bg-gray-900/40 rounded-2xl border ${track.border} transition-all`}>
                
                {/* Volume Level Indicator */}
                <div 
                   className={`absolute bottom-0 left-0 right-0 rounded-b-2xl opacity-10 transition-all ${track.bg}`}
                   style={{ height: `${muted[track.id] ? 0 : volumes[track.id] * 100}%` }}
                ></div>

                {/* Vertical Slider */}
                <div className='h-full flex items-center py-4 z-10'>
                   <input
                     type="range"
                     min="0"
                     max="1"
                     step="0.01"
                     value={volumes[track.id]}
                     onChange={(e) => handleVolumeChange(track.id, e.target.value)}
                     className="h-32 w-2 appearance-none bg-gray-700 rounded-full outline-none vertical-slider"
                     style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' }}
                   />
                </div>

                {/* Mute Button */}
                <button 
                  onClick={() => toggleMute(track.id)}
                  className={`mb-3 p-2 rounded-full ${muted[track.id] ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-gray-400'} hover:bg-white/10 transition-colors z-10`}
                >
                  {muted[track.id] ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>

                {/* Icon & Label */}
                <div className='flex flex-col items-center gap-1 z-10'>
                   <track.icon className={track.color} size={18} />
                   <span className={`text-[10px] font-bold uppercase tracking-wider ${track.color}`}>{track.label}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Master Controls */}
          <div className='flex flex-col gap-4 p-6 bg-gray-900/80 backdrop-blur-md rounded-3xl border border-gray-800 shadow-xl'>
             {/* Progress Bar */}
             <input
               type="range"
               min="0"
               max={duration || 100}
               value={currentTime}
               onChange={handleSeek}
               className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
             />

             {/* Buttons */}
             <div className='flex items-center justify-center gap-8'>
               <button 
                  onClick={() => { setCurrentTime(0); Object.values(audioRefs.current).forEach(a => a.currentTime = 0); }}
                  className='text-gray-400 hover:text-white transition-colors'
               >
                 <SkipBack size={24} />
               </button>

               <button 
                 onClick={togglePlay}
                 disabled={!isReady}
                 className={`p-5 rounded-full ${isPlaying ? 'bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.5)]' : 'bg-gray-100 text-black'} transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
               >
                 {isPlaying ? <Pause size={28} className='text-white' fill='currentColor' /> : <Play size={28} className='ml-1' fill='currentColor' />}
               </button>

               <button 
                  onClick={() => {setStems(null); stopAll();}}
                  className='text-gray-400 hover:text-white transition-colors'
               >
                 <RotateCcw size={24} />
               </button>
             </div>
          </div>

        </div>
      )}

      {error && (
        <div className='absolute bottom-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl max-w-sm text-center backdrop-blur-sm z-50'>
          <p className='text-red-400 text-xs font-medium'>{error}</p>
        </div>
      )}
    </div>
  );
};

export default RemixLab;
