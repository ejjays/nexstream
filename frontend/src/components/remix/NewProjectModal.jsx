import React, { useState, useEffect } from 'react';
import { X, Music, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';

const NewProjectModal = ({ 
  isOpen, 
  onClose, 
  apiUrl, 
  setApiUrl, 
  getBackendUrl,
  engineMode, 
  setEngineMode, 
  stemMode, 
  setStemMode, 
  handleUpload 
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle, syncing, found, timeout

  const checkEngineStatus = async () => {
    setIsSyncing(true);
    setSyncStatus('syncing');
    
    let attempts = 0;
    const maxAttempts = 15; // 30 seconds total

    const poll = async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/remix/engine-status`);
        const data = await res.json();
        
        if (data.url) {
          setApiUrl(data.url);
          setSyncStatus('found');
          setIsSyncing(false);
          return true;
        }
      } catch (e) {
        console.error("Sync error:", e);
      }
      return false;
    };

    const interval = setInterval(async () => {
      attempts++;
      const found = await poll();
      if (found || attempts >= maxAttempts) {
        clearInterval(interval);
        if (!found) {
          setSyncStatus('timeout');
          setIsSyncing(false);
        }
      }
    }, 2000);
  };

  useEffect(() => {
    if (!isOpen) {
      setSyncStatus('idle');
      setIsSyncing(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-[#050505] z-[200] flex flex-col animate-in slide-in-from-bottom-full duration-300 ease-out'>
      <div className='flex items-center justify-between p-4 sm:p-5 border-b border-white/5 shrink-0 bg-[#0a0a0a]'>
        <button
          onClick={onClose}
          className='text-zinc-500 hover:text-white p-2 transition-colors -ml-1'
        >
          <X size={24} strokeWidth={2.5} />
        </button>
        <h2 className='text-base sm:text-lg font-bold text-white tracking-wide'>
          New Project
        </h2>
        <div className='w-10'></div>
      </div>

      <div className='flex-1 overflow-y-auto w-full'>
        <div className='max-w-4xl mx-auto p-6 sm:p-12 flex flex-col gap-10 pb-32'>
          <div className='space-y-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-sm font-bold text-zinc-500 uppercase tracking-widest'>
                Compute Source
              </h3>
              <button 
                onClick={checkEngineStatus}
                disabled={isSyncing}
                className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all ${
                  syncStatus === 'found' 
                    ? 'border-green-500/30 bg-green-500/10 text-green-400' 
                    : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:border-white/20'
                }`}
              >
                {isSyncing ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Syncing...
                  </>
                ) : syncStatus === 'found' ? (
                  <>
                    <CheckCircle2 size={12} />
                    Engine Active
                  </>
                ) : (
                  <>
                    <RefreshCw size={12} />
                    Auto-Link Engine
                  </>
                )}
              </button>
            </div>
            <div className='bg-[#0a0a0a] border border-white/5 rounded-2xl p-2'>
              <input
                type='text'
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder='https://xxxx.gradio.live'
                className='w-full bg-transparent px-4 py-4 text-white focus:outline-none text-base sm:text-lg placeholder:text-zinc-700 font-mono'
              />
            </div>
            <p className='text-zinc-600 text-sm px-2'>
              {syncStatus === 'syncing' 
                ? 'Waiting for Kaggle to wake up and send its link...'
                : syncStatus === 'timeout'
                ? 'Auto-link timed out. Please ensure your notebook is running or paste manually.'
                : 'Paste the Gradio URL or click Auto-Link after starting your Kaggle notebook.'}
            </p>
          </div>

          <div className='space-y-4'>
            <h3 className='text-sm font-bold text-zinc-500 uppercase tracking-widest'>
              Processing Engine
            </h3>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <button
                onClick={() => setEngineMode('Demucs (Fast / Balanced)')}
                className={`flex flex-col items-start text-left p-6 rounded-2xl border transition-all duration-200 ${
                  engineMode.includes('Demucs')
                    ? 'bg-[#22d3ee]/10 border-[#22d3ee]/30'
                    : 'bg-[#0a0a0a] border-white/5 hover:border-white/20'
                }`}
              >
                <div className='flex items-center justify-between w-full mb-2'>
                  <span
                    className={`text-lg font-bold ${
                      engineMode.includes('Demucs')
                        ? 'text-[#22d3ee]'
                        : 'text-white'
                    }`}
                  >
                    HTDemucs
                  </span>
                  {engineMode.includes('Demucs') && (
                    <div className='w-2 h-2 rounded-full bg-[#22d3ee] shadow-[0_0_10px_#22d3ee]'></div>
                  )}
                </div>
                <span className='text-zinc-500 text-sm'>
                  Fastest processing. Balanced quality, ideal for standard
                  tracks.
                </span>
              </button>

              <button
                onClick={() => setEngineMode('BS-RoFormer (Ultra Quality)')}
                className={`flex flex-col items-start text-left p-6 rounded-2xl border transition-all duration-200 ${
                  engineMode.includes('RoFormer')
                    ? 'bg-[#22d3ee]/10 border-[#22d3ee]/30'
                    : 'bg-[#0a0a0a] border-white/5 hover:border-white/20'
                }`}
              >
                <div className='flex items-center justify-between w-full mb-2'>
                  <span
                    className={`text-lg font-bold ${
                      engineMode.includes('RoFormer')
                        ? 'text-[#22d3ee]'
                        : 'text-white'
                    }`}
                  >
                    BS-RoFormer
                  </span>
                  {engineMode.includes('RoFormer') && (
                    <div className='w-2 h-2 rounded-full bg-[#22d3ee] shadow-[0_0_10px_#22d3ee]'></div>
                  )}
                </div>
                <span className='text-zinc-500 text-sm'>
                  Studio-grade accuracy. Heavy compute, uses
                  Swin-Transformer.
                </span>
              </button>
            </div>
          </div>

          <div className='space-y-4'>
            <h3 className='text-sm font-bold text-zinc-500 uppercase tracking-widest'>
              Extraction Depth
            </h3>
            <div className='flex flex-col sm:flex-row gap-4'>
              <button
                onClick={() => setStemMode('4 Stems')}
                className={`flex-1 py-5 px-6 text-base font-bold rounded-2xl border transition-all duration-200 ${
                  stemMode === '4 Stems'
                    ? 'bg-[#22d3ee]/10 text-[#22d3ee] border-[#22d3ee]/30'
                    : 'bg-[#0a0a0a] text-zinc-400 border-white/5 hover:border-white/20 hover:text-white'
                }`}
              >
                4 Tracks (Standard)
              </button>
              <button
                onClick={() => setStemMode('6 Stems')}
                className={`flex-1 py-5 px-6 text-base font-bold rounded-2xl border transition-all duration-200 ${
                  stemMode === '6 Stems'
                    ? 'bg-[#22d3ee]/10 text-[#22d3ee] border-[#22d3ee]/30'
                    : 'bg-[#0a0a0a] text-zinc-400 border-white/5 hover:border-white/20 hover:text-white'
                }`}
              >
                6 Tracks (Extended)
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className='p-6 sm:p-8 bg-black/80 backdrop-blur-xl border-t border-white/5 shrink-0 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] absolute bottom-0 left-0 right-0'>
        <div className='max-w-4xl mx-auto'>
          <label className='w-full flex items-center justify-center gap-3 bg-white text-black hover:bg-zinc-200 rounded-2xl py-5 sm:py-6 font-bold text-lg sm:text-xl cursor-pointer transition-transform active:scale-[0.98]'>
            <Music size={24} strokeWidth={2.5} />
            Select Audio or Project File
            <input
              type='file'
              accept='audio/*,.zip,.nexremix'
              className='hidden'
              onChange={e => {
                handleUpload(e);
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export default NewProjectModal;
