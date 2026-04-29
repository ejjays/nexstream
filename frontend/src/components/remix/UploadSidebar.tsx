// @ts-nocheck
import React from 'react';
import { Music, ListMusic, User, ChevronRight } from 'lucide-react';

const UploadSidebar = ({ logoImg, onExit }) => {
  return (
    <div className='hidden md:flex w-64 bg-[#050505] border-r border-cyan-900/30 shadow-[4px_0_24px_rgba(0,0,0,0.5)] flex-col p-4 shrink-0'>
      <div className='flex items-center gap-2 mb-8 px-2'>
        <div className='flex items-center justify-center'>
          <img
            src={logoImg}
            alt='RemixLab'
            className='w-8 h-8 object-contain'
          />
        </div>
        <span className='text-xl font-bold text-white tracking-wide'>
          RemixLab
        </span>
      </div>

      <nav className='flex flex-col gap-2'>
        <button className='flex items-center gap-3 bg-cyan-950/30 text-cyan-400 border border-cyan-500/20 px-4 py-3 rounded-xl font-medium'>
          <Music size={20} />
          Songs
        </button>
        <button className='flex items-center gap-3 text-zinc-400 hover:text-white hover:bg-[#1a1a1a] px-4 py-3 rounded-xl font-medium transition-colors'>
          <ListMusic size={20} />
          Setlists
        </button>
        <button className='flex items-center gap-3 text-zinc-400 hover:text-white hover:bg-[#1a1a1a] px-4 py-3 rounded-xl font-medium transition-colors'>
          <User size={20} />
          Profile
        </button>
      </nav>

      <div className='mt-auto pt-4'>
        <button
          onClick={onExit}
          className='flex items-center gap-3 text-zinc-500 hover:text-white hover:bg-[#1a1a1a] px-4 py-3 rounded-xl font-medium transition-colors w-full'
        >
          <ChevronRight className='rotate-180' size={20} />
          Exit Studio
        </button>
      </div>
    </div>
  );
};

export default UploadSidebar;
