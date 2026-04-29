// @ts-nocheck
import React from 'react';
import { Music, MoreVertical, Download, Edit2, Trash2 } from 'lucide-react';

export const SongItem = ({ 
  item, 
  idx, 
  onSelect, 
  menuOpenId, 
  setMenuOpenId, 
  onExport, 
  onRename, 
  onDelete 
}) => {
  const trackCount = item.stems ? Object.keys(item.stems).length : 0;
  
  return (
    <div
      onClick={() => onSelect(item)}
      className='flex items-center justify-between p-3 hover:bg-[#1a1a1a] rounded-xl cursor-pointer transition-colors group'
    >
      <div className='flex items-center gap-4 flex-1 min-w-0'>
        <div className='w-14 h-14 bg-[#1a1a1a] rounded-xl flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors shrink-0'>
          <Music size={24} />
        </div>
        <div className='flex flex-col truncate pr-4'>
          <div className='text-white font-medium text-base truncate'>
            {item.name}
          </div>
          <div className='text-zinc-500 text-xs sm:text-sm mt-0.5 sm:hidden block truncate'>
            {trackCount} Tracks ({item.engine || 'Hi-Fi'})
          </div>
        </div>
      </div>

      <div className='flex items-center gap-4 shrink-0 relative'>
        <div className='text-zinc-500 text-sm hidden sm:block'>
          {trackCount} Tracks ({item.engine || 'Hi-Fi'})
        </div>

        <div className='relative'>
          <button
            onClick={e => {
              e.stopPropagation();
              setMenuOpenId(menuOpenId === (item.id || idx) ? null : (item.id || idx));
            }}
            className='text-zinc-600 hover:text-white p-2 transition-colors'
          >
            <MoreVertical size={20} />
          </button>

          {menuOpenId === (item.id || idx) && (
            <div className='absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-[150] overflow-hidden animate-in fade-in zoom-in-95 duration-100'>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onExport(item);
                  setMenuOpenId(null);
                }}
                className='w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-[#22d3ee] hover:bg-white/5 transition-colors'
              >
                <Download size={16} />
                <span>Export Project</span>
              </button>
              <button
                className='w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-white/5 transition-colors'
                onClick={e => {
                  e.stopPropagation();
                  onRename(item);
                  setMenuOpenId(null);
                }}
              >
                <Edit2 size={16} />
                <span>Rename Project</span>
              </button>
              <button
                className='w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors'
                onClick={e => {
                  e.stopPropagation();
                  onDelete(item);
                  setMenuOpenId(null);
                }}
              >
                <Trash2 size={16} />
                <span>Delete Project</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const DemoSongItem = ({ demo, onSelect }) => {
  return (
    <div
      onClick={() => onSelect(demo)}
      className='flex items-center justify-between p-3 hover:bg-[#1a1a1a] rounded-xl cursor-pointer transition-colors group'
    >
      <div className='flex items-center gap-4 flex-1 min-w-0'>
        {demo.thumbnail ? (
          <div className='w-14 h-14 rounded-lg overflow-hidden shrink-0'>
            <img
              src={demo.thumbnail}
              alt={demo.name}
              className='w-full h-full object-cover'
            />
          </div>
        ) : (
          <div className='w-14 h-14 bg-gradient-to-br from-cyan-900 to-blue-900 rounded-xl flex items-center justify-center text-cyan-300 group-hover:text-white transition-colors shrink-0'>
            <Music size={24} />
          </div>
        )}
        <div className='flex flex-col truncate pr-4'>
          <h3 className='text-white font-medium truncate text-base mb-1'>
            {demo.name}
          </h3>
          <div className='flex items-center gap-2'>
            <span className='px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-xs font-semibold'>
              DEMO
            </span>
            <span className='text-zinc-500 text-sm'>6 Stems</span>
          </div>
        </div>
      </div>
    </div>
  );
};
