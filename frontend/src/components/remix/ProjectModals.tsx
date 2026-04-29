// @ts-nocheck
import React from 'react';

export const RenameModal = ({ isOpen, newName, setNewName, onCancel, onSave }) => {
  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-[300] bg-[#050505]/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200'>
      <div className='bg-[#141414] border border-white/5 rounded-[20px] w-full max-w-[360px] p-6 shadow-2xl flex flex-col gap-6'>
        <h2 className='text-xl font-medium text-white tracking-tight'>
          Rename Project
        </h2>
        <input
          type='text'
          value={newName}
          onChange={e => setNewName(e.target.value)}
          className='w-full bg-[#0a0a0a] text-white rounded-xl py-3.5 px-4 focus:outline-none focus:ring-1 focus:ring-[#22d3ee]/50 border border-white/5 transition-all text-[15px]'
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') onSave();
          }}
        />
        <div className='flex items-center justify-end gap-3 mt-2'>
          <button
            onClick={onCancel}
            className='px-5 py-2.5 rounded-xl text-zinc-400 hover:text-white font-medium transition-colors text-[15px]'
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className='px-5 py-2.5 rounded-xl bg-[#22d3ee]/10 text-[#22d3ee] hover:bg-[#22d3ee]/20 font-medium transition-colors text-[15px]'
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export const DeleteModal = ({ isOpen, projectName, onCancel, onDelete }) => {
  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-[300] bg-[#050505]/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200'>
      <div className='bg-[#141414] border border-red-500/10 rounded-[20px] w-full max-w-[360px] p-6 shadow-2xl flex flex-col gap-5'>
        <h2 className='text-xl font-medium text-white tracking-tight'>
          Delete Project
        </h2>
        <p className='text-zinc-400 text-[15px] leading-relaxed'>
          Are you sure you want to delete{' '}
          <span className='text-white font-medium'>
            "{projectName}"
          </span>
          ? This action cannot be undone.
        </p>
        <div className='flex items-center justify-end gap-3 mt-4'>
          <button
            onClick={onCancel}
            className='px-5 py-2.5 rounded-xl text-zinc-400 hover:text-white font-medium transition-colors text-[15px]'
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            className='px-5 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 font-medium transition-colors text-[15px]'
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};
