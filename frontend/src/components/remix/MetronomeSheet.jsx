import React from 'react';
import { Metronome } from 'lucide-react';

const MetronomeSheet = ({
  showMetroSheet,
  setShowMetroSheet,
  isMetronome,
  setIsMetronome,
  tempo,
  metroVolume,
  setMetroVolume,
  metroSound,
  setMetroSound,
  gridShift,
  setGridShift
}) => {
  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/60 z-[105] backdrop-blur-sm transition-opacity duration-300 ${showMetroSheet ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
        onClick={() => setShowMetroSheet(false)} 
      />
      <div 
        className={`fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-[32px] p-6 pb-10 z-[110] transition-transform duration-300 ease-out flex flex-col max-w-xl mx-auto shadow-2xl ${showMetroSheet ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto mb-6 shrink-0" />
        
        <div className="flex justify-center items-center mb-2">
          <h3 className="text-xl font-bold flex items-center gap-2.5">
            <Metronome size={24} className={isMetronome ? "text-cyan-400" : "text-zinc-500"} />
            Smart Metronome
          </h3>
        </div>

        {tempo > 0 && (
          <div className="flex justify-center mb-6">
            <div className="bg-zinc-800/60 px-4 py-1.5 rounded-full border border-zinc-700/50">
              <span className="text-sm font-bold text-zinc-300 tracking-tight">Detected Tempo: </span>
              <span className="text-sm font-black text-cyan-400 font-mono">{tempo} BPM</span>
            </div>
          </div>
        )}        
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
          <div className="mb-6 px-1">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Metronome Volume</span>
              <span className="text-xs text-cyan-400 font-mono font-bold">{Math.round(metroVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={metroVolume}
              onChange={e => setMetroVolume(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer outline-none accent-cyan-500"
            />
          </div>

          <span className="text-xs text-zinc-400 font-bold uppercase tracking-widest mb-4 block px-1">Sound Signature</span>
          <div className="grid grid-cols-3 gap-3 mb-8">
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

          <div className="px-1 border-t border-white/5 pt-6">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Grid Shift</span>
              <span className={`text-xs font-mono font-bold ${gridShift === 0 ? 'text-zinc-500' : 'text-cyan-400'}`}>
                {gridShift > 0 ? '+' : ''}{gridShift} Beats
              </span>
            </div>
            <input
              type="range"
              min="-8"
              max="8"
              step="1"
              value={gridShift}
              onChange={e => setGridShift(parseInt(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer outline-none accent-amber-500"
            />
            <p className="text-[10px] text-zinc-600 mt-2 text-center italic">Nudge chord labels left or right to match the audio</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default MetronomeSheet;
