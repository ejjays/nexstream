import React from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

const UploadScreen = ({ isProcessing, stemMode, setStemMode, handleUpload }) => {
  if (isProcessing) {
    return (
      <div className='flex-1 flex flex-col items-center justify-center'>
        <Loader2 className='text-cyan-400 animate-spin mb-4' size={40} />
        <p className='text-zinc-400 font-medium text-sm sm:text-lg'>
          AI is analyzing...
        </p>
      </div>
    );
  }

  return (
    <div className='flex-1 flex flex-col items-center justify-center text-center w-full max-w-sm mx-auto'>
      <div className='w-16 h-16 sm:w-24 sm:h-24 bg-zinc-900/50 rounded-full flex items-center justify-center mb-4 sm:mb-8 border border-zinc-800/50 mx-auto'>
        <Sparkles className='text-purple-400' size={28} />
      </div>
      <h2 className='text-xl sm:text-2xl font-bold mb-2 sm:mb-3'>AI Composer</h2>
      <p className='text-zinc-500 text-xs sm:text-sm mb-6 sm:mb-8 max-w-[240px] mx-auto'>
        Isolate tracks & detect chords with Viterbi sync
      </p>
      
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

      <label className='w-full py-3 sm:py-4 bg-white text-black rounded-xl font-bold text-sm sm:text-base cursor-pointer hover:bg-zinc-200 transition-colors mx-auto block'>
        Select Audio File
        <input
          type='file'
          accept='audio/*'
          className='hidden'
          onChange={handleUpload}
        />
      </label>
    </div>
  );
};

export default UploadScreen;
