import React, { useState } from 'react';
import logoImg from '/logo.webp';
import { Loader2, Plus, Music, ListMusic, User, Search, Settings, ChevronRight, X, Smartphone, MoreVertical, Radio } from 'lucide-react';

const UploadScreen = ({ isProcessing, stemMode, setStemMode, engineMode, setEngineMode, apiUrl, setApiUrl, handleUpload, history = [], onSelectHistory, onExit }) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);

  if (isProcessing) {
    return (
      <div className='fixed inset-0 bg-[#050505]/95 backdrop-blur-sm z-[150] flex flex-col items-center justify-center'>
        <Loader2 className='text-[#22d3ee] animate-spin mb-4' size={48} strokeWidth={2} />
        <p className='text-zinc-400 font-medium text-lg'>
          Separating Tracks...
        </p>
      </div>
    );
  }

  return (
    <div className='flex-1 flex w-full bg-black h-full absolute inset-0 z-[100] overflow-hidden text-white font-sans'>
      
      {/* Sidebar (Desktop) */}
      <div className='hidden md:flex w-64 bg-[#050505] border-r border-cyan-900/30 shadow-[4px_0_24px_rgba(0,0,0,0.5)] flex-col p-4 shrink-0'>
        <div className='flex items-center gap-2 mb-8 px-2'>
          <div className='flex items-center justify-center'>
             <img src={logoImg} alt="RemixLab" className="w-8 h-8 object-contain" />
          </div>
          <span className='text-xl font-bold text-white tracking-wide'>RemixLab</span>
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
        
        {/* Exit Button at the bottom of sidebar */}
        <div className='mt-auto pt-4'>
          <button onClick={onExit} className='flex items-center gap-3 text-zinc-500 hover:text-white hover:bg-[#1a1a1a] px-4 py-3 rounded-xl font-medium transition-colors w-full'>
            <ChevronRight className="rotate-180" size={20} />
            Exit Studio
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className='flex-1 flex flex-col bg-black h-full overflow-hidden w-full'>
        
        {/* Top Header */}
        <div className='p-4 sm:p-8 pb-4 shrink-0 flex flex-col gap-6'>
          <div className='flex items-center gap-4'>
            <button onClick={onExit} className='md:hidden text-zinc-400 hover:text-white p-1'>
               <ChevronRight className="rotate-180" size={24} />
            </button>
            <h1 className='text-2xl sm:text-3xl font-medium text-white tracking-tight'>Songs</h1>
          </div>
          
          <div className='flex items-center gap-4 w-full'>
            <div className='relative flex-1 max-w-3xl'>
              <Search className='absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500' size={20} />
              <input 
                type="text" 
                placeholder="Search your library" 
                className="w-full bg-[#1a1a1a] text-white rounded-xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-1 focus:ring-zinc-600 placeholder:text-zinc-500 text-sm sm:text-base border border-transparent transition-colors"
              />
            </div>
            
            <button 
              onClick={() => setShowUploadModal(true)}
              className='flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#252525] text-[#22d3ee] px-5 sm:px-6 py-3.5 rounded-xl font-medium transition-colors text-sm sm:text-base border border-transparent shrink-0'
            >
              <Plus size={18} strokeWidth={2.5} />
              <span className="hidden sm:block">Upload</span>
              <span className="sm:hidden">Add</span>
            </button>

            <button 
              className='flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#252525] text-[#22d3ee] px-5 sm:px-6 py-3.5 rounded-xl font-medium transition-colors text-sm sm:text-base border border-transparent shrink-0 opacity-60 grayscale'
              title="Feature coming soon"
            >
              <Radio size={18} strokeWidth={2.5} />
              <span className="hidden sm:block">Tuner</span>
            </button>
          </div>
        </div>

        {/* Songs List Area */}
        <div className='flex-1 overflow-y-auto px-4 sm:px-8 py-2'>
           <div className='text-zinc-500 text-sm mb-4 font-medium'>{history.length} {history.length === 1 ? 'Song' : 'Songs'}</div>
           
           {history.length === 0 ? (
               <div className='flex flex-col items-center justify-center h-64 text-zinc-500 gap-4'>
                  <Music size={48} className="opacity-20" />
                  <p className="text-lg">Your library is empty.</p>
                  <button onClick={() => setShowUploadModal(true)} className="text-[#22d3ee] font-medium hover:text-[#0891b2] transition-colors bg-[#1a1a1a] px-6 py-2.5 rounded-full">Upload a song to get started</button>
               </div>
           ) : (
               <div className='flex flex-col gap-1 pb-20'>
                 {history.slice(0, visibleCount).map((item, idx) => {
                   const trackCount = item.stems ? Object.keys(item.stems).length : 0;
                   return (
                     <div 
                       key={item.id || idx} 
                       onClick={() => onSelectHistory(item)}
                       className='flex items-center justify-between p-3 hover:bg-[#1a1a1a] rounded-xl cursor-pointer transition-colors group'
                     >
                        <div className='flex items-center gap-4 flex-1 min-w-0'>
                          <div className='w-14 h-14 bg-[#1a1a1a] rounded-xl flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors shrink-0'>
                            <Music size={24} />
                          </div>
                          <div className='flex flex-col truncate pr-4'>
                            <div className='text-white font-medium text-base truncate'>{item.name}</div>
                            <div className='text-zinc-500 text-xs sm:text-sm mt-0.5 sm:hidden block truncate'>
                               {trackCount} Tracks ({item.engine || 'Hi-Fi'})
                            </div>
                          </div>
                        </div>
                        
                        <div className='flex items-center gap-6 shrink-0'>
                          <div className='text-zinc-500 text-sm hidden sm:block'>
                            {trackCount} Tracks ({item.engine || 'Hi-Fi'})
                          </div>
                          <button className='text-zinc-600 hover:text-white p-2'>
                            <MoreVertical size={20} />
                          </button>
                        </div>
                     </div>
                   )
                 })}
                 
                 {history.length > visibleCount && (
                   <button 
                     onClick={() => setVisibleCount(prev => prev + 5)}
                     className="mt-4 py-3 w-full border border-[#1a1a1a] hover:bg-[#1a1a1a] rounded-xl text-zinc-400 hover:text-white font-medium transition-colors"
                   >
                     Show More
                   </button>
                 )}
               </div>
           )}
        </div>
      </div>

      {/* Full Screen Upload Modal (Slide up) */}
      {showUploadModal && (
        <div className='fixed inset-0 bg-[#050505]/95 backdrop-blur-sm z-[200] flex flex-col animate-in slide-in-from-bottom-full duration-300 ease-out'>
          
          {/* Modal Header */}
          <div className='flex items-center justify-between p-4 border-b border-cyan-900/40 shrink-0 bg-[#050505] shadow-[0_4px_30px_rgba(34,211,238,0.1)]'>
             <button onClick={() => setShowUploadModal(false)} className='text-zinc-400 hover:text-white p-2 transition-colors'>
               <X size={28} />
             </button>
             <h2 className='text-xl font-bold text-white'>Upload Options</h2>
             <div className='w-11'></div> {/* Spacer for centering */}
          </div>

          <div className='flex-1 overflow-y-auto p-4 sm:p-8 w-full max-w-3xl mx-auto'>
            
            {/* Kaggle URL Block */}
            <div className='mb-8'>
              <h3 className='text-zinc-500 uppercase tracking-widest text-[11px] font-bold mb-3 px-2'>Connection</h3>
              <div className='bg-[#121212] rounded-2xl p-5 flex flex-col gap-3 border border-[#1a1a1a]'>
                <label className='text-white font-semibold text-sm'>Kaggle Endpoint URL</label>
                <input 
                  type="text" 
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://xxxx.gradio.live"
                  className="w-full bg-[#050505] border border-cyan-900/30 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[#22d3ee] transition-colors text-sm placeholder:text-zinc-600"
                />
              </div>
            </div>

            {/* Engine Selection Block */}
            <div className='mb-8'>
              <h3 className='text-zinc-500 uppercase tracking-widest text-[11px] font-bold mb-3 px-2'>Separation Engine</h3>
              <div className='bg-[#121212] rounded-2xl overflow-hidden border border-[#1a1a1a]'>
                
                <button 
                  onClick={() => setEngineMode("Demucs (Fast / Balanced)")}
                  className='w-full flex items-center justify-between p-5 border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors group'
                >
                  <div className='text-left'>
                    <div className='text-white font-semibold text-lg group-hover:text-[#22d3ee] transition-colors'>Demucs</div>
                    <div className='text-zinc-400 text-sm mt-1'>Fast processing, balanced quality</div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${engineMode === "Demucs (Fast / Balanced)" ? "border-[#22d3ee]" : "border-zinc-600"}`}>
                    {engineMode === "Demucs (Fast / Balanced)" && <div className='w-3 h-3 bg-[#22d3ee] rounded-full'></div>}
                  </div>
                </button>

                <button 
                  onClick={() => setEngineMode("BS-RoFormer (Ultra Quality)")}
                  className='w-full flex items-center justify-between p-5 hover:bg-[#1a1a1a] transition-colors group'
                >
                  <div className='text-left'>
                    <div className='text-white font-semibold text-lg group-hover:text-[#22d3ee] transition-colors'>BS-RoFormer</div>
                    <div className='text-zinc-400 text-sm mt-1'>Maximum accuracy, Swin-Transformer architecture</div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${engineMode === "BS-RoFormer (Ultra Quality)" ? "border-[#22d3ee]" : "border-zinc-600"}`}>
                    {engineMode === "BS-RoFormer (Ultra Quality)" && <div className='w-3 h-3 bg-[#22d3ee] rounded-full'></div>}
                  </div>
                </button>

              </div>
            </div>

            {/* Stems Block */}
            <div className='mb-8'>
              <h3 className='text-zinc-500 uppercase tracking-widest text-[11px] font-bold mb-3 px-2'>Stem Count</h3>
              <div className='bg-[#121212] rounded-2xl overflow-hidden border border-[#1a1a1a]'>
                
                <button 
                  onClick={() => setStemMode("4 Stems")}
                  className='w-full flex items-center justify-between p-5 border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors group'
                >
                  <div className='text-left'>
                    <div className='text-white font-semibold text-lg group-hover:text-[#22d3ee] transition-colors'>4 Tracks</div>
                    <div className='text-zinc-400 text-sm mt-1'>Vocals, Drums, Bass, Other</div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${stemMode === "4 Stems" ? "border-[#22d3ee]" : "border-zinc-600"}`}>
                    {stemMode === "4 Stems" && <div className='w-3 h-3 bg-[#22d3ee] rounded-full'></div>}
                  </div>
                </button>

                <button 
                  onClick={() => setStemMode("6 Stems")}
                  className='w-full flex items-center justify-between p-5 hover:bg-[#1a1a1a] transition-colors group'
                >
                  <div className='text-left'>
                    <div className='text-white font-semibold text-lg group-hover:text-[#22d3ee] transition-colors'>6 Tracks</div>
                    <div className='text-zinc-400 text-sm mt-1'>Adds isolated Guitar and Piano tracks</div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${stemMode === "6 Stems" ? "border-[#22d3ee]" : "border-zinc-600"}`}>
                    {stemMode === "6 Stems" && <div className='w-3 h-3 bg-[#22d3ee] rounded-full'></div>}
                  </div>
                </button>

              </div>
            </div>

          </div>

          {/* Fixed Bottom Upload Button */}
          <div className='p-6 bg-[#0a0a0a] border-t border-[#1a1a1a] shrink-0 pb-8 sm:pb-6'>
            <label className='w-full max-w-3xl mx-auto flex items-center justify-center bg-[#22d3ee] hover:bg-[#0891b2] text-black rounded-full py-4 sm:py-5 font-bold text-lg cursor-pointer transition-transform active:scale-[0.98]'>
              Select Audio File
              <input
                type='file'
                accept='audio/*'
                className='hidden'
                onChange={(e) => {
                  setShowUploadModal(false);
                  handleUpload(e);
                }}
              />
            </label>
          </div>
        </div>
      )}

    </div>
  );
};

export default UploadScreen;
