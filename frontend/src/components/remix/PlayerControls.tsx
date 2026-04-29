// @ts-nocheck
import React from 'react';
import { Play, Pause, SkipBack, RotateCcw, Metronome, Mic } from "lucide-react";
import { useRemixContext } from '../../context/RemixContext';
import { useRemixStore } from '../../store/useRemixStore';

const PlayerControls = ({ setShowLyricsSheet }) => {
  const {
    handleSeek, togglePlay, 
    resetProject, isMetronome, setShowMetroSheet
  } = useRemixContext();

  const isPlaying = useRemixStore(state => state.isPlaying);
  const duration = useRemixStore(state => state.duration);
  const currentTime = useRemixStore(state => state.currentTime);

  // time helpers
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
        <div className="absolute right-0 flex items-center">
          <button 
            onClick={() => setShowLyricsSheet(true)}
            className="p-2 rounded-full text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Mic size={24} className="sm:w-8 sm:h-8" />
          </button>
        </div>

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
          className='w-14 h-14 sm:w-20 sm:h-20 bg-white text-black rounded-full flex items-center justify-center shadow-2xl shrink-0 outline outline-2 outline-cyan-400 outline-offset-4 active:scale-95 transition-all'
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
          onClick={resetProject}
          className='text-white'
        >
          <RotateCcw
            className='w-6 h-6 sm:w-10 sm:h-10 text-zinc-600'
            strokeWidth={1.5}
          />
        </button>
      </div>
    </footer>
  );
};

export default PlayerControls;
