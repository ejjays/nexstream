import React, { useState, useEffect } from 'react';
import { X, Music, RefreshCw, CheckCircle2, Loader2, Settings, Key, User } from 'lucide-react';
import { useRemixStore } from '../../store/useRemixStore';

const KaggleSettings = ({ 
  show, 
  kaggleUser, 
  setKaggleUser, 
  kaggleKey, 
  setKaggleKey 
}: { 
  show: boolean; 
  kaggleUser: string; 
  setKaggleUser: (v: string) => void; 
  kaggleKey: string; 
  setKaggleKey: (v: string) => void; 
}) => {
  if (!show) return null;
  return (
    <div className='bg-[#0a0a0a] border border-[#22d3ee]/20 rounded-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200'>
      <div className='flex items-center gap-2 text-[#22d3ee] mb-2'>
        <Key size={14} />
        <span className='text-xs font-bold uppercase tracking-widest'>Kaggle Credentials</span>
      </div>
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
        <div className='space-y-2'>
          <label className='text-[10px] text-zinc-500 uppercase font-bold ml-1'>Username</label>
          <div className='flex items-center bg-black/40 border border-white/5 rounded-xl px-4 focus-within:border-[#22d3ee]/40 transition-colors'>
            <User size={14} className='text-zinc-600' />
            <input 
              type="text"
              value={kaggleUser}
              onChange={e => setKaggleUser(e.target.value)}
              placeholder="kaggle_user"
              className='w-full bg-transparent py-3 px-3 text-sm text-white focus:outline-none placeholder:text-zinc-800'
            />
          </div>
        </div>
        <div className='space-y-2'>
          <label className='text-[10px] text-zinc-500 uppercase font-bold ml-1'>API Key</label>
          <div className='flex items-center bg-black/40 border border-white/5 rounded-xl px-4 focus-within:border-[#22d3ee]/40 transition-colors'>
            <Key size={14} className='text-zinc-600' />
            <input 
              type="password"
              value={kaggleKey}
              onChange={e => setKaggleKey(e.target.value)}
              placeholder="••••••••••••••••"
              className='w-full bg-transparent py-3 px-3 text-sm text-white focus:outline-none placeholder:text-zinc-800'
            />
          </div>
        </div>
      </div>
      <p className='text-[10px] text-zinc-600 leading-relaxed italic'>
        * Your keys are only used to trigger the Kaggle kernel via your own account and are never stored on our servers.
      </p>
    </div>
  );
};

const EngineButton = ({ 
  label, 
  description, 
  isActive, 
  onClick 
}: { 
  label: string; 
  description: string; 
  isActive: boolean; 
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-start text-left p-6 rounded-2xl border transition-all duration-200 ${
      isActive
        ? 'bg-[#22d3ee]/10 border-[#22d3ee]/30'
        : 'bg-[#0a0a0a] border-white/5 hover:border-white/20'
    }`}
  >
    <div className='flex items-center justify-between w-full mb-2'>
      <span className={`text-lg font-bold ${isActive ? 'text-[#22d3ee]' : 'text-white'}`}>{label}</span>
      {isActive && <div className='w-2 h-2 rounded-full bg-[#22d3ee] shadow-[0_0_10px_#22d3ee]'></div>}
    </div>
    <span className='text-zinc-500 text-sm'>{description}</span>
  </button>
);

const EngineOptions = ({ engineMode, setEngineMode }: { engineMode: string; setEngineMode: (m: string) => void }) => (
  <div className='space-y-4'>
    <h3 className='text-sm font-bold text-zinc-500 uppercase tracking-widest'>
      Processing Engine
    </h3>
    <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
      <EngineButton 
        label="HTDemucs"
        description="Fastest processing. Balanced quality, ideal for standard tracks."
        isActive={engineMode.includes('Demucs')}
        onClick={() => setEngineMode('Demucs (Fast / Balanced)')}
      />
      <EngineButton 
        label="BS-RoFormer"
        description="Studio-grade accuracy. Heavy compute, uses Swin-Transformer."
        isActive={engineMode.includes('RoFormer')}
        onClick={() => setEngineMode('BS-RoFormer (Ultra Quality)')}
      />
    </div>
  </div>
);

const ComputeSource = ({
  showKaggleSettings,
  setShowKaggleSettings,
  checkEngineStatus,
  isSyncing,
  syncStatus,
  kaggleUser,
  setKaggleUser,
  kaggleKey,
  setKaggleKey,
  apiUrl,
  setApiUrl
}: {
  showKaggleSettings: boolean;
  setShowKaggleSettings: (v: boolean) => void;
  checkEngineStatus: () => void;
  isSyncing: boolean;
  syncStatus: string;
  kaggleUser: string;
  setKaggleUser: (v: string) => void;
  kaggleKey: string;
  setKaggleKey: (v: string) => void;
  apiUrl: string;
  setApiUrl: (v: string) => void;
}) => (
  <div className='space-y-4'>
    <div className='flex items-center justify-between'>
      <h3 className='text-sm font-bold text-zinc-500 uppercase tracking-widest'>
        Compute Source
      </h3>
      <div className='flex items-center gap-2'>
        <button 
          onClick={() => setShowKaggleSettings(!showKaggleSettings)}
          className={`p-2 rounded-lg border transition-all ${
            showKaggleSettings ? 'bg-[#22d3ee]/10 border-[#22d3ee]/30 text-[#22d3ee]' : 'bg-white/5 border-white/5 text-zinc-500 hover:text-white'
          }`}
        >
          <Settings size={16} />
        </button>
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
    </div>

    <KaggleSettings 
      show={showKaggleSettings}
      kaggleUser={kaggleUser}
      setKaggleUser={setKaggleUser}
      kaggleKey={kaggleKey}
      setKaggleKey={setKaggleKey}
    />

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
        : syncStatus === 'error'
        ? 'Failed to trigger Kaggle. Check your credentials and try again.'
        : 'Paste the Gradio URL or click Auto-Link after starting your Kaggle notebook.'}
    </p>
  </div>
);

const StemOption = ({
  label,
  isActive,
  onClick
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex-1 py-5 px-6 text-base font-bold rounded-2xl border transition-all duration-200 ${
      isActive
        ? 'bg-[#22d3ee]/10 text-[#22d3ee] border-[#22d3ee]/30'
        : 'bg-[#0a0a0a] text-zinc-400 border-white/5 hover:border-white/20 hover:text-white'
    }`}
  >
    {label}
  </button>
);

const ModalHeader = ({ onClose }: { onClose: () => void }) => (
  <div className='flex items-center justify-between p-4 sm:p-5 border-b border-white/5 shrink-0 bg-[#0a0a0a]'>
    <button onClick={onClose} className='text-zinc-500 hover:text-white p-2 transition-colors -ml-1'>
      <X size={24} strokeWidth={2.5} />
    </button>
    <h2 className='text-base sm:text-lg font-bold text-white tracking-wide'>New Project</h2>
    <div className='w-10'></div>
  </div>
);

const ModalFooter = ({ handleUpload }: { handleUpload: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
  <div className='p-6 sm:p-8 bg-black/80 backdrop-blur-xl border-t border-white/5 shrink-0 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] absolute bottom-0 left-0 right-0'>
    <div className='max-w-4xl mx-auto'>
      <label className='w-full flex items-center justify-center gap-3 bg-white text-black hover:bg-zinc-200 rounded-2xl py-5 sm:py-6 font-bold text-lg sm:text-xl cursor-pointer transition-transform active:scale-[0.98]'>
        <Music size={24} strokeWidth={2.5} />
        Select Audio or Project File
        <input type='file' accept='audio/*,.zip,.nexremix' className='hidden' onChange={handleUpload} />
      </label>
    </div>
  </div>
);

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  setSessionId: (id: string) => void;
  getBackendUrl: () => string;
  engineMode: string;
  setEngineMode: (mode: string) => void;
  stemMode: string;
  setStemMode: (mode: string) => void;
  handleUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

const NewProjectModal = ({ 
  isOpen, 
  onClose, 
  apiUrl, 
  setApiUrl, 
  setSessionId,
  getBackendUrl,
  engineMode, 
  setEngineMode, 
  stemMode, 
  setStemMode, 
  handleUpload 
}: NewProjectModalProps) => {
  const backendUrlFromStore = useRemixStore(state => state.backendUrl);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [showKaggleSettings, setShowKaggleSettings] = useState(false);
  
  const [kaggleUser, setKaggleUser] = useState(() => localStorage.getItem('kaggle_user') || '');
  const [kaggleKey, setKaggleKey] = useState(() => localStorage.getItem('kaggle_key') || '');

  const checkEngineStatus = async () => {
    if (!kaggleUser || !kaggleKey) {
      setShowKaggleSettings(true);
      return;
    }

    // persist credentials
    localStorage.setItem('kaggle_user', kaggleUser);
    localStorage.setItem('kaggle_key', kaggleKey);

    setIsSyncing(true);
    setSyncStatus('syncing');
    
    // resolve URL
    const effectiveBackendUrl = backendUrlFromStore || getBackendUrl();
    
    let currentSessionId = '';
    try {
      const res = await fetch(`${getBackendUrl()}/api/remix/wake-engine`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kaggleUsername: kaggleUser,
          kaggleKey,
          backendUrl: effectiveBackendUrl
        })
      });
      const data = await res.json();
      currentSessionId = data.session_id;
      setSessionId(currentSessionId);
    } catch (e) {
      console.error("Wake-up trigger failed:", e);
      setSyncStatus('error');
      setIsSyncing(false);
      return;
    }

    if (!currentSessionId) {
      setSyncStatus('error');
      setIsSyncing(false);
      return;
    }

    let attempts = 0;
    const maxAttempts = 80; // 6.5 mins

    const poll = async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/remix/engine-status?session_id=${currentSessionId}`);
        const data = await res.json();
        
        if (data.url) {
          setApiUrl(data.url);
          setSyncStatus('found');
          setIsSyncing(false);
          localStorage.setItem('remix_session_id', currentSessionId);
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
    }, 5000);
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
      <ModalHeader onClose={onClose} />

      <div className='flex-1 overflow-y-auto w-full'>
        <div className='max-w-4xl mx-auto p-6 sm:p-12 flex flex-col gap-10 pb-32'>
          
          <ComputeSource 
            showKaggleSettings={showKaggleSettings}
            setShowKaggleSettings={setShowKaggleSettings}
            checkEngineStatus={checkEngineStatus}
            isSyncing={isSyncing}
            syncStatus={syncStatus}
            kaggleUser={kaggleUser}
            setKaggleUser={setKaggleUser}
            kaggleKey={kaggleKey}
            setKaggleKey={setKaggleKey}
            apiUrl={apiUrl}
            setApiUrl={setApiUrl}
          />

          <EngineOptions engineMode={engineMode} setEngineMode={setEngineMode} />

          <div className='space-y-4'>
            <h3 className='text-sm font-bold text-zinc-500 uppercase tracking-widest'>
              Extraction Depth
            </h3>
            <div className='flex flex-col sm:flex-row gap-4'>
              <StemOption 
                label="4 Tracks (Standard)"
                isActive={stemMode === '4 Stems'}
                onClick={() => setStemMode('4 Stems')}
              />
              <StemOption 
                label="6 Tracks (Extended)"
                isActive={stemMode === '6 Stems'}
                onClick={() => setStemMode('6 Stems')}
              />
            </div>
          </div>
        </div>
      </div>

      <ModalFooter handleUpload={handleUpload} />
    </div>
  );
};

export default NewProjectModal;
