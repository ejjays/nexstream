import React, { useState, useEffect, useRef } from 'react';
import { MoreVertical } from 'lucide-react';

const VolumeSlider = ({
  track,
  initialVolume,
  onVolumeChange,
  onVolumeCommit
}) => {
  const fillRef = useRef(null);
  const thumbRef = useRef(null);
  const inputRef = useRef(null);

  const isPointerDown = useRef(false);
  const didMove = useRef(false);
  const startX = useRef(0);
  const lastVal = useRef(initialVolume);

  useEffect(() => {
    if (!isPointerDown.current) {
      updateDOM(initialVolume, true);
      if (inputRef.current) inputRef.current.value = initialVolume;
      lastVal.current = initialVolume;
    }
  }, [initialVolume]);

  const updateDOM = (val, animate = false) => {
    if (fillRef.current && thumbRef.current) {
      const percentage = val * 100;
      const transition = animate ? 'all 0.3s ease-out' : 'none';

      fillRef.current.style.transition = transition;
      thumbRef.current.style.transition = transition;

      fillRef.current.style.width = `${percentage}%`;
      thumbRef.current.style.left = `${percentage}%`;
    }
  };

  const handlePointerDown = e => {
    isPointerDown.current = true;
    didMove.current = false;
    startX.current = e.clientX;
  };

  const handlePointerMove = e => {
    if (isPointerDown.current) {
      if (Math.abs(e.clientX - startX.current) > 5) {
        didMove.current = true;
      }
    }
  };

  const handleInput = e => {
    const val = parseFloat(e.target.value);
    lastVal.current = val;

    if (didMove.current) {
      updateDOM(val, false);
    }

    onVolumeChange(track.id, val);
  };

  const handlePointerUp = e => {
    isPointerDown.current = false;

    if (!didMove.current) {
      updateDOM(lastVal.current, true);
    }

    onVolumeCommit(track.id, lastVal.current);
  };

  return (
    <div className='flex items-center gap-3 sm:gap-6 group'>
      <track.icon
        size={20}
        className='text-white shrink-0 sm:w-7 sm:h-7'
        strokeWidth={1.2}
      />

      <div className='flex-1 relative flex items-center h-8'>
        {/* Track Background */}
        <div className='absolute w-full h-[2px] sm:h-[3px] bg-zinc-800 rounded-full pointer-events-none' />

        {/* Animated Fill Layer */}
        <div
          ref={fillRef}
          className='absolute h-[2px] sm:h-[3px] bg-cyan-400 rounded-full pointer-events-none'
          style={{ width: `${initialVolume * 100}%` }}
        />

        <input
          ref={inputRef}
          type='range'
          min='0'
          max='1'
          step='0.001'
          defaultValue={initialVolume}
          onInput={handleInput}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className='absolute w-full h-full opacity-0 cursor-pointer z-10'
        />

        {/* Visual Thumb */}
        <div
          ref={thumbRef}
          className={`absolute w-5 h-5 sm:w-8 sm:h-8 rounded-full border border-black bg-zinc-900 shadow-[inset_0_0_0_4px_#22d3ee] pointer-events-none z-0 transform -translate-x-1/2 sm:border-[8px] sm:border-zinc-900 sm:bg-zinc-700 sm:shadow-[0_0_0_2px_#3f3f46,inset_0_0_0_4px_#22d3ee]`}
          style={{ left: `${initialVolume * 100}%` }}
        />
      </div>

      <button className='text-zinc-600 hover:text-zinc-300 transition-colors'>
        <MoreVertical size={18} />
      </button>
    </div>
  );
};

export default VolumeSlider;
