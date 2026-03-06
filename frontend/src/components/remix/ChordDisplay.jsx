import React from 'react';

const ChordDisplay = ({ currentChord, beatFlash }) => {
  return (
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
  );
};

export default ChordDisplay;
