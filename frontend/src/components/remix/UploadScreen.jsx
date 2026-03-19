import React, { useState, useEffect } from 'react';
import { DEMO_SONGS } from './DemoSongsConfig.js';
import logoImg from '/logo.webp';
import { Loader2, Plus, Music, ListMusic, User, Search, Settings, ChevronRight, X, Smartphone, MoreVertical, Radio, Download, Trash2, Edit2 } from 'lucide-react';
import Lottie from 'lottie-react';
import tigerHappyLottie from '../../assets/lottie/tiger-happy.json';
import DotPattern from '../ui/DotPattern.jsx';
import ShootingStars from '../ui/ShootingStars.jsx';

const UploadScreen = ({ isProcessing, stemMode, setStemMode, engineMode, setEngineMode, apiUrl, setApiUrl, handleUpload, history = [], onSelectHistory, onExportHistory, onDeleteHistory, onRenameHistory, onExit }) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  const [menuOpenId, setMenuOpenId] = useState(null);
  
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null, projectName: '' });
  const [renameModal, setRenameModal] = useState({ isOpen: false, id: null, currentName: '', newName: '' });

  const handleSelectDemo = async (demo) => {
    try {
      const res = await fetch(demo.chordsPath);
      const projectData = await res.json();
      
      onSelectHistory({
        id: demo.id,
        name: demo.name,
        isDemo: true,
        stems: demo.stems,
        chords: projectData.chords || [],
        beats: projectData.beats || [],
        tempo: projectData.tempo || 0
      });
    } catch(err) {
      console.error("Failed to load demo song metadata", err);
    }
  };


  useEffect(() => {
    const handleClickOutside = () => setMenuOpenId(null);
    if (menuOpenId !== null) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [menuOpenId]);

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
      <div className='flex-1 flex flex-col bg-black h-full overflow-hidden w-full max-w-full'>
        
        {/* Top Header */}
        <div className='p-4 sm:p-8 pb-4 shrink-0 flex flex-col gap-6 w-full max-w-full box-border'>
          <div className='flex items-center gap-4'>
            <button onClick={onExit} className='md:hidden text-zinc-400 hover:text-white p-1'>
               <ChevronRight className="rotate-180" size={24} />
            </button>
            <h1 className='text-2xl sm:text-3xl font-medium text-white tracking-tight'>Songs</h1>
          </div>
          
          <div className='flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full'>
            <div className='relative w-full sm:flex-1'>
              <Search className='absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500' size={20} />
              <input 
                type="text" 
                placeholder="Search your library" 
                className="w-full bg-[#1a1a1a] text-white rounded-xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-1 focus:ring-zinc-600 placeholder:text-zinc-500 text-sm sm:text-base border border-transparent transition-colors box-border"
              />
            </div>
            
            <div className='flex items-center gap-3 w-full sm:w-auto shrink-0'>
              <button 
                onClick={() => setShowUploadModal(true)}
                className='flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#1a1a1a] hover:bg-[#252525] text-[#22d3ee] px-5 sm:px-6 py-3.5 rounded-xl font-medium transition-colors text-sm sm:text-base border border-transparent whitespace-nowrap'
              >
                <Plus size={18} strokeWidth={2.5} />
                <span className="hidden sm:block">Upload</span>
                <span className="sm:hidden">Add</span>
              </button>

              <button 
                className='flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#1a1a1a] hover:bg-[#252525] text-[#22d3ee] px-5 sm:px-6 py-3.5 rounded-xl font-medium transition-colors text-sm sm:text-base border border-transparent opacity-60 grayscale whitespace-nowrap'
                title="Feature coming soon"
              >
                <Radio size={18} strokeWidth={2.5} />
                <span>Tuner</span>
              </button>
            </div>
          </div>
        </div>

        {/* Songs List Area */}
        <div className='flex-1 overflow-y-auto px-4 sm:px-8 py-2 flex flex-col'>
           <div className='text-zinc-500 text-sm mb-4 font-medium shrink-0'>{history.length} {history.length === 1 ? 'Song' : 'Songs'}</div>
           
           {history.length === 0 && (
               <div className='flex flex-col flex-1 pb-10'>
                  {/* Empty State Card */}
                  <div className='relative overflow-hidden flex flex-col items-center justify-center py-12 text-zinc-500 gap-4 mb-4 border border-dashed border-zinc-800/50 bg-[#141414]/50 rounded-2xl'>
                    <div className="absolute inset-0 pointer-events-none opacity-40">
                      <DotPattern className="absolute" showBackground={false} />
                      <ShootingStars className="absolute" starColor='#22d3ee' />
                    </div>
                    <div className="relative z-10 w-48 h-48 sm:w-64 sm:h-64 opacity-80 pointer-events-none -mb-6 mt-4">
                       <Lottie animationData={tigerHappyLottie} loop={true} />
                    </div>
                    <p className="relative z-10 text-xl font-medium text-zinc-300 mb-2">Your library is empty.</p>
                  </div>
               </div>
           )}
           
           {history.length > 0 && (
               <div className='flex flex-col gap-1 mb-4'>
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
                        
                        <div className='flex items-center gap-4 shrink-0 relative'>
                          <div className='text-zinc-500 text-sm hidden sm:block'>
                            {trackCount} Tracks ({item.engine || 'Hi-Fi'})
                          </div>
                          
                          <div className='relative'>
                            <button 
                              onClick={(e) => { 
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
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    onExportHistory(item); 
                                    setMenuOpenId(null);
                                  }}
                                  className='w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-[#22d3ee] hover:bg-white/5 transition-colors'
                                >
                                  <Download size={16} />
                                  <span>Export Project</span>
                                </button>
                                <button 
                                  className='w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-white/5 transition-colors'
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenameModal({ isOpen: true, id: item.id, currentName: item.name, newName: item.name });
                                    setMenuOpenId(null);
                                  }}
                                >
                                  <Edit2 size={16} />
                                  <span>Rename Project</span>
                                </button>
                                <button 
                                  className='w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors'
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteModal({ isOpen: true, id: item.id, projectName: item.name });
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

           {/* DEMO SONGS SECTION */}
           <div className='mt-8 pt-6 border-t border-zinc-900/50'>
             <h3 className='text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4'>Try these examples</h3>
             <div className='flex flex-col gap-1 mb-4'>
               {DEMO_SONGS.map((demo) => (
                 <div 
                   key={demo.id} 
                   onClick={() => handleSelectDemo(demo)}
                   className='flex items-center justify-between p-3 hover:bg-[#1a1a1a] rounded-xl cursor-pointer transition-colors group'
                 >
                    <div className='flex items-center gap-4 flex-1 min-w-0'>
                      <div className='w-14 h-14 bg-gradient-to-br from-cyan-900 to-blue-900 rounded-xl flex items-center justify-center text-cyan-300 group-hover:text-white transition-colors shrink-0'>
                        <Music size={24} />
                      </div>
                      <div className='flex flex-col truncate pr-4'>
                        <h3 className='text-white font-medium truncate text-base mb-1'>{demo.name}</h3>
                        <div className='flex items-center gap-2'>
                           <span className='px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-xs font-semibold'>DEMO</span>
                           <span className='text-zinc-500 text-sm'>6 Stems</span>
                        </div>
                      </div>
                    </div>
                 </div>
               ))}
             </div>
           </div>
        </div>
      </div>

      {/* Full Screen Upload Modal */}
      {/* Custom Rename Modal */}
      {renameModal.isOpen && (
        <div className="fixed inset-0 z-[300] bg-[#050505]/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#141414] border border-white/5 rounded-[20px] w-full max-w-[360px] p-6 shadow-2xl flex flex-col gap-6">
            <h2 className="text-xl font-medium text-white tracking-tight">Rename Project</h2>
            <input 
              type="text" 
              value={renameModal.newName}
              onChange={e => setRenameModal(prev => ({...prev, newName: e.target.value}))}
              className="w-full bg-[#0a0a0a] text-white rounded-xl py-3.5 px-4 focus:outline-none focus:ring-1 focus:ring-[#22d3ee]/50 border border-white/5 transition-all text-[15px]"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  onRenameHistory(renameModal.id, renameModal.currentName, renameModal.newName);
                  setRenameModal({ isOpen: false, id: null, currentName: '', newName: '' });
                }
              }}
            />
            <div className="flex items-center justify-end gap-3 mt-2">
              <button 
                onClick={() => setRenameModal({isOpen: false, id: null, currentName: '', newName: ''})} 
                className="px-5 py-2.5 rounded-xl text-zinc-400 hover:text-white font-medium transition-colors text-[15px]"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  onRenameHistory(renameModal.id, renameModal.currentName, renameModal.newName);
                  setRenameModal({ isOpen: false, id: null, currentName: '', newName: '' });
                }} 
                className="px-5 py-2.5 rounded-xl bg-[#22d3ee]/10 text-[#22d3ee] hover:bg-[#22d3ee]/20 font-medium transition-colors text-[15px]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-[300] bg-[#050505]/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#141414] border border-red-500/10 rounded-[20px] w-full max-w-[360px] p-6 shadow-2xl flex flex-col gap-5">
            <h2 className="text-xl font-medium text-white tracking-tight">Delete Project</h2>
            <p className="text-zinc-400 text-[15px] leading-relaxed">
              Are you sure you want to delete <span className="text-white font-medium">"{deleteModal.projectName}"</span>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 mt-4">
              <button 
                onClick={() => setDeleteModal({isOpen: false, id: null, projectName: ''})} 
                className="px-5 py-2.5 rounded-xl text-zinc-400 hover:text-white font-medium transition-colors text-[15px]"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  onDeleteHistory(deleteModal.id);
                  setDeleteModal({ isOpen: false, id: null, projectName: '' });
                }} 
                className="px-5 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 font-medium transition-colors text-[15px]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className='fixed inset-0 bg-[#050505] z-[200] flex flex-col animate-in slide-in-from-bottom-full duration-300 ease-out'>
          
          {/* Modal Header */}
          <div className='flex items-center justify-between p-4 sm:p-5 border-b border-white/5 shrink-0 bg-[#0a0a0a]'>
             <button onClick={() => setShowUploadModal(false)} className='text-zinc-500 hover:text-white p-2 transition-colors -ml-1'>
               <X size={24} strokeWidth={2.5} />
             </button>
             <h2 className='text-base sm:text-lg font-bold text-white tracking-wide'>New Project</h2>
             <div className='w-10'></div> {/* Spacer */}
          </div>

          <div className='flex-1 overflow-y-auto w-full'>
            <div className='max-w-4xl mx-auto p-6 sm:p-12 flex flex-col gap-10 pb-32'>
              
              {/* Kaggle URL Block */}
              <div className='space-y-4'>
                <h3 className='text-sm font-bold text-zinc-500 uppercase tracking-widest'>Compute Source</h3>
                <div className='bg-[#0a0a0a] border border-white/5 rounded-2xl p-2'>
                  <input 
                    type="text" 
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://xxxx.gradio.live"
                    className="w-full bg-transparent px-4 py-4 text-white focus:outline-none text-base sm:text-lg placeholder:text-zinc-700 font-mono"
                  />
                </div>
                <p className='text-zinc-600 text-sm px-2'>Paste the Gradio URL from your running Kaggle notebook.</p>
              </div>

              {/* Engine Selection Block */}
              <div className='space-y-4'>
                <h3 className='text-sm font-bold text-zinc-500 uppercase tracking-widest'>Processing Engine</h3>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <button 
                    onClick={() => setEngineMode("Demucs (Fast / Balanced)")}
                    className={`flex flex-col items-start text-left p-6 rounded-2xl border transition-all duration-200 ${engineMode.includes("Demucs") ? "bg-[#22d3ee]/10 border-[#22d3ee]/30" : "bg-[#0a0a0a] border-white/5 hover:border-white/20"}`}
                  >
                    <div className='flex items-center justify-between w-full mb-2'>
                      <span className={`text-lg font-bold ${engineMode.includes("Demucs") ? "text-[#22d3ee]" : "text-white"}`}>HTDemucs</span>
                      {engineMode.includes("Demucs") && <div className='w-2 h-2 rounded-full bg-[#22d3ee] shadow-[0_0_10px_#22d3ee]'></div>}
                    </div>
                    <span className='text-zinc-500 text-sm'>Fastest processing. Balanced quality, ideal for standard tracks.</span>
                  </button>

                  <button 
                    onClick={() => setEngineMode("BS-RoFormer (Ultra Quality)")}
                    className={`flex flex-col items-start text-left p-6 rounded-2xl border transition-all duration-200 ${engineMode.includes("RoFormer") ? "bg-[#22d3ee]/10 border-[#22d3ee]/30" : "bg-[#0a0a0a] border-white/5 hover:border-white/20"}`}
                  >
                    <div className='flex items-center justify-between w-full mb-2'>
                      <span className={`text-lg font-bold ${engineMode.includes("RoFormer") ? "text-[#22d3ee]" : "text-white"}`}>BS-RoFormer</span>
                      {engineMode.includes("RoFormer") && <div className='w-2 h-2 rounded-full bg-[#22d3ee] shadow-[0_0_10px_#22d3ee]'></div>}
                    </div>
                    <span className='text-zinc-500 text-sm'>Studio-grade accuracy. Heavy compute, uses Swin-Transformer.</span>
                  </button>
                </div>
              </div>

              {/* Stems Block */}
              <div className='space-y-4'>
                <h3 className='text-sm font-bold text-zinc-500 uppercase tracking-widest'>Extraction Depth</h3>
                <div className='flex flex-col sm:flex-row gap-4'>
                  <button 
                    onClick={() => setStemMode("4 Stems")}
                    className={`flex-1 py-5 px-6 text-base font-bold rounded-2xl border transition-all duration-200 ${stemMode === "4 Stems" ? "bg-[#22d3ee]/10 text-[#22d3ee] border-[#22d3ee]/30" : "bg-[#0a0a0a] text-zinc-400 border-white/5 hover:border-white/20 hover:text-white"}`}
                  >
                    4 Tracks (Standard)
                  </button>
                  <button 
                    onClick={() => setStemMode("6 Stems")}
                    className={`flex-1 py-5 px-6 text-base font-bold rounded-2xl border transition-all duration-200 ${stemMode === "6 Stems" ? "bg-[#22d3ee]/10 text-[#22d3ee] border-[#22d3ee]/30" : "bg-[#0a0a0a] text-zinc-400 border-white/5 hover:border-white/20 hover:text-white"}`}
                  >
                    6 Tracks (Extended)
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Fixed Bottom Action Bar */}
          <div className='p-6 sm:p-8 bg-black/80 backdrop-blur-xl border-t border-white/5 shrink-0 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] absolute bottom-0 left-0 right-0'>
            <div className='max-w-4xl mx-auto'>
              <label className='w-full flex items-center justify-center gap-3 bg-white text-black hover:bg-zinc-200 rounded-2xl py-5 sm:py-6 font-bold text-lg sm:text-xl cursor-pointer transition-transform active:scale-[0.98]'>
                <Music size={24} strokeWidth={2.5} />
                Select Audio or Project File
                <input
                  type='file'
                  accept='audio/*,.zip,.nexremix'
                  className='hidden'
                  onChange={(e) => {
                    setShowUploadModal(false);
                    handleUpload(e);
                  }}
                />
              </label>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};

export default UploadScreen;
