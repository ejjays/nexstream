import React, { useEffect } from 'react';
import { X, Mic, MicOff, Loader2 } from 'lucide-react';
import { useTuner } from '../../hooks/useTuner';

const Tuner = ({ onClose }) => {
  const { note, cents, isRecording, isLoadingModel, error, start, stop } = useTuner();

  useEffect(() => {
    start();
    return () => stop();
  }, []);

  const getNeedleRotation = () => {
    const maxRotation = 45;
    const clampedCents = Math.max(-50, Math.min(50, cents));
    return (clampedCents / 50) * maxRotation;
  };

  const isTuned = Math.abs(cents) < 5;

  return (
    <div className="fixed inset-0 z-[300] bg-[#050505]/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-[#141414] border border-white/5 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
        
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-[#0a0a0a]">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${isRecording && !isLoadingModel ? 'bg-red-500 animate-pulse' : 'bg-zinc-600'}`}></div>
            <h2 className="text-lg font-bold text-white tracking-wide">Studio Tuner</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-2 transition-colors -mr-2">
            <X size={24} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-8 flex flex-col items-center">
          {error ? (
            <div className="text-red-400 text-center py-10 bg-red-500/10 rounded-2xl w-full border border-red-500/20">
              <MicOff size={48} className="mx-auto mb-4 opacity-50" />
              <p className="font-medium">{error}</p>
              <button 
                onClick={start}
                className="mt-4 px-6 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl transition-colors"
              >
                Retry Access
              </button>
            </div>
          ) : isLoadingModel ? (
             <div className="text-zinc-400 text-center py-16 flex flex-col items-center justify-center">
               <Loader2 size={48} className="animate-spin mb-6 text-[#22d3ee]" />
               <p className="font-medium text-lg text-white">Initializing Engine...</p>
               <p className="text-sm mt-2 opacity-60">Preparing audio context.</p>
             </div>
          ) : (
            <>
              <div className="text-[120px] font-black leading-none mb-2 tracking-tighter" style={{ color: isTuned && note !== '-' ? '#22d3ee' : '#ffffff', textShadow: isTuned && note !== '-' ? '0 0 40px rgba(34,211,238,0.5)' : 'none' }}>
                {note}
              </div>
              
              <div className="text-2xl font-medium mb-12" style={{ color: isTuned && note !== '-' ? '#22d3ee' : '#a1a1aa' }}>
                {note === '-' ? 'Waiting for audio...' : `${cents > 0 ? '+' : ''}${cents} cents`}
              </div>

              <div className="relative w-full h-32 flex justify-center mb-8">
                <div className="absolute top-0 w-full h-full flex justify-center">
                   <div className="w-[1px] h-4 bg-zinc-700 absolute left-1/4"></div>
                   <div className="w-[2px] h-6 bg-[#22d3ee] absolute left-1/2 -translate-x-1/2 shadow-[0_0_10px_#22d3ee]"></div>
                   <div className="w-[1px] h-4 bg-zinc-700 absolute right-1/4"></div>
                </div>
                
                <div 
                  className="absolute bottom-0 w-1.5 h-32 bg-white origin-bottom rounded-full transition-transform duration-75"
                  style={{ transform: `rotate(${getNeedleRotation()}deg)` }}
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full"></div>
                </div>
                
                <div className="absolute bottom-[-8px] w-6 h-6 bg-zinc-800 rounded-full border-4 border-[#141414] z-10"></div>
              </div>

              <div className="flex w-full justify-between px-4 text-sm font-bold text-zinc-600">
                <span>FLAT</span>
                <span>TUNE</span>
                <span>SHARP</span>
              </div>
            </>
          )}
        </div>

        <div className="p-5 border-t border-white/5 bg-[#0a0a0a] flex justify-center">
           <button 
             onClick={isRecording ? stop : start}
             disabled={isLoadingModel}
             className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${isLoadingModel ? 'opacity-50 cursor-not-allowed bg-zinc-800 text-zinc-500' : isRecording ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-[#22d3ee] hover:bg-[#1cb0c6] text-black'}`}
           >
             {isRecording && !isLoadingModel ? <MicOff size={20} /> : <Mic size={20} />}
             {isLoadingModel ? 'Loading...' : isRecording ? 'Stop Tuning' : 'Start Tuning'}
           </button>
        </div>
      </div>
    </div>
  );
};

export default Tuner;
