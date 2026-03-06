import React from 'react';
import { X, Play } from 'lucide-react';

const HistoryOverlay = ({ showHistory, setShowHistory, history, onRestore }) => {
  if (!showHistory) return null;

  return (
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
        {history.map(item => (
          <div
            key={item.id}
            onClick={() => {
              onRestore(item);
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
  );
};

export default HistoryOverlay;
