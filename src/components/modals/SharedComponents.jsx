import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Download, SquarePen } from 'lucide-react';
import FormatIcon from '../../assets/icons/FormatIcon.jsx';
import { formatSize, getQualityLabel } from '../../lib/utils';

export const QualitySelectionShared = ({ 
  options, 
  isDropdownOpen, 
  setIsDropdownOpen, 
  selectedOption, 
  setSelectedQualityId, 
  handleDownloadClick,
  dropdownRef,
  selectedQualityId,
  isPartial,
  isMobile = false
}) => (
  <div className='space-y-2 mt-2 relative'>
    <p className='text-cyan-400 text-[10px] font-black uppercase tracking-[0.15em] ml-1 opacity-80'>
      {isPartial ? 'Syncing...' : 'Select Output Quality'}
    </p>
    <div className='flex gap-2.5 relative'>
      <div className='relative flex-1' ref={dropdownRef}>
        {isPartial ? (
          <div className='w-full h-[58px] bg-white/5 border border-white/10 rounded-2xl flex items-center px-4 justify-between'>
            <div className='flex flex-col gap-1.5 w-full'>
              <div className='h-3.5 w-[60%] bg-white/10 rounded-lg relative overflow-hidden'>
                <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_1.5s_infinite]' />
              </div>
              <div className='h-2.5 w-[30%] bg-white/5 rounded-lg relative overflow-hidden'>
                <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_1.5s_infinite]' />
              </div>
            </div>
            <ChevronDown className='text-gray-600 shrink-0' size={isMobile ? 18 : 20} />
          </div>
        ) : (
          options.length > 0 ? (
            <>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`w-full h-full bg-white/5 border ${isDropdownOpen ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'border-white/10'} rounded-2xl py-3.5 px-4 text-white text-left focus:outline-none hover:bg-white/10 transition-all ${isMobile ? 'text-xs sm:text-sm' : 'text-sm'} font-bold flex items-center justify-between group overflow-hidden`}
              >
                <div className='flex flex-col min-w-0 flex-1 mr-2'>
                  <div className='flex items-center gap-2'>
                    <span className='tracking-tight truncate'>{getQualityLabel(selectedOption?.quality)}</span>
                    {selectedOption?.quality?.includes('(Original Master)') && (
                      <span className='text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-black uppercase tracking-tighter shrink-0'>Original Master</span>
                    )}
                    {selectedOption?.fps && (
                      <span className='text-[9px] px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-black uppercase tracking-tighter shrink-0'>{selectedOption.fps === 'FAST' ? 'FAST' : `${selectedOption.fps}fps`}</span>
                    )}
                  </div>
                  <span className='text-[10px] text-cyan-400/60 font-medium mt-0.5 truncate'>{formatSize(selectedOption?.filesize)} • {selectedOption?.extension?.toUpperCase() || 'RAW'}</span>
                </div>
                <ChevronDown className={`text-gray-400 shrink-0 transition-all duration-500 ${isDropdownOpen ? 'rotate-180 text-cyan-400 scale-110' : 'group-hover:text-white'}`} size={isMobile ? 18 : 20} />
              </motion.button>

              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className='absolute bottom-full left-0 w-full mb-3 bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/20 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7),0_0_20px_rgba(6,182,212,0.1)] z-[100] overflow-hidden'
                  >
                    <div className='px-4 py-3 border-b border-white/5 bg-white/5 backdrop-blur-md'>
                      <span className='text-[9px] font-black text-cyan-400 uppercase tracking-[0.2em]'>Available Streams</span>
                    </div>
                    <div className={`max-h-60 overflow-y-auto custom-scrollbar mb-4 mt-1 mx-1.5 py-1`}>
                      {options.map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => { setSelectedQualityId(option.format_id); setIsDropdownOpen(false); }}
                          className={`w-full px-4 py-3 text-left hover:bg-cyan-500/5 transition-all flex items-center justify-between group relative ${selectedQualityId === option.format_id ? 'text-cyan-400' : 'text-gray-300'}`}
                        >
                          {selectedQualityId === option.format_id && (
                            <motion.div layoutId='active-bg' className='absolute inset-0 bg-cyan-500/10 border-l-2 border-cyan-500' />
                          )}
                          <div className='flex flex-col relative z-10'>
                            <div className='flex items-center gap-2'>
                              <span className='text-sm font-bold whitespace-nowrap'>{getQualityLabel(option.quality)}</span>
                              {option.quality?.includes('(Original Master)') && (
                                <span className='text-[8px] px-1 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-black uppercase tracking-tighter shrink-0'>Original Master</span>
                              )}
                              {option.fps && (
                                <span className='text-[8px] px-1 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-black uppercase tracking-tighter shrink-0'>{option.fps === 'FAST' ? 'FAST' : `${option.fps} FPS`}</span>
                              )}
                            </div>
                            <span className='text-[10px] text-cyan-400/40 group-hover:text-cyan-400/70 transition-colors font-medium mt-0.5'>{formatSize(option.filesize)} • {option.extension?.toUpperCase() || 'RAW'}</span>
                          </div>
                          {selectedQualityId === option.format_id && (
                            <div className='bg-cyan-500/20 p-1 rounded-full relative z-10'><Check size={12} strokeWidth={4} /></div>
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className='w-full h-[58px] bg-white/5 rounded-2xl flex items-center px-4 border border-dashed border-white/10'>
              <p className='text-gray-500 text-[10px] italic'>No formats found.</p>
            </div>
          )
        )}
      </div>

      <motion.button
        whileHover={!isPartial ? { scale: 1.02 } : {}}
        whileTap={!isPartial ? { scale: 0.98 } : {}}
        disabled={isPartial}
        onClick={handleDownloadClick}
        className={`${isPartial ? 'bg-gray-800 border-gray-700 cursor-not-allowed text-gray-500' : 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-[0_10px_20px_rgba(6,182,212,0.3)] border-cyan-400/30'} ${isMobile ? 'px-4 sm:px-7' : 'px-7'} py-3 rounded-2xl flex items-center gap-2 font-black transition-all border shrink-0`}
      >
        {isPartial ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <FormatIcon size={20} className='opacity-50' />
          </motion.div>
        ) : (
          <Download size={22} strokeWidth={2.5} />
        )}
        <span className='hidden sm:inline uppercase text-xs tracking-wider'>{isPartial ? 'Syncing...' : 'Get File'}</span>
      </motion.button>
    </div>
  </div>
);

export const EditModeUIShared = ({ 
  editedTitle, setEditedTitle, editedArtist, setEditedArtist, editedAlbum, setEditedAlbum, 
  selectedFormat, videoData, setIsEditing, isSpotify = false
}) => (
  <motion.div key='edit-mode' initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className='flex flex-col gap-4'>
    <div className='flex flex-col gap-3'>
      <div className='space-y-1'>
        <label className='text-[10px] text-cyan-400 uppercase font-bold tracking-wider ml-1'>Title</label>
        <input value={editedTitle} onChange={e => setEditedTitle(e.target.value)} placeholder='Enter title' className='w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:bg-black/40 transition-all placeholder-gray-600' />
      </div>
      <div className='flex gap-3 items-center'>
        <div className='space-y-1 flex-1'>
          <label className='text-[10px] text-cyan-400 uppercase font-bold tracking-wider ml-1'>{isSpotify || selectedFormat !== 'mp4' ? 'Artist' : 'Author'}</label>
          <input value={editedArtist} onChange={e => setEditedArtist(e.target.value)} placeholder={isSpotify || selectedFormat !== 'mp4' ? 'Enter artist' : 'Enter author'} className='w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:bg-black/40 transition-all placeholder-gray-600' />
        </div>
        {(isSpotify || selectedFormat !== 'mp4') && (
          <div className='space-y-1 flex-1 mt-1.5'>
            <div className='flex gap-1 text-gray-400 items-center'>
              <label className='text-[10px] text-cyan-400 uppercase font-bold tracking-wider ml-1'>Album</label>
              <p className='text-[9px]'>(optional)</p>
            </div>
            <input value={editedAlbum} onChange={e => setEditedAlbum(e.target.value)} placeholder='Enter album' className='w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:bg-black/40 transition-all placeholder-gray-600' />
          </div>
        )}
      </div>
    </div>
    <div className='flex gap-3 mt-2'>
      <button onClick={() => { setEditedTitle(videoData.title || ''); setEditedArtist(videoData.artist || ''); setEditedAlbum(videoData.album || ''); setIsEditing(false); }} className='flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium'>Cancel</button>
      <button onClick={() => setIsEditing(false)} className='flex-1 bg-cyan-500 hover:bg-cyan-400 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-cyan-500/20 text-sm flex items-center justify-center gap-1'><Check size={16} strokeWidth={4} />Save Changes</button>
    </div>
  </motion.div>
);
