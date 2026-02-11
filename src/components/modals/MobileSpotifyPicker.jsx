import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  Pause,
  Download,
  Music,
  Monitor,
  ChevronDown,
  SquarePen,
  Check,
  Music2
} from 'lucide-react';
import { createPortal } from 'react-dom';
import FormatIcon from '../../assets/icons/FormatIcon.jsx';

const getSpotifyOptions = (videoData) => {
  if (!videoData) return [];
  let currentOptions = videoData.audioFormats || [];
  const hasMp3 = currentOptions.some(o => o.format_id === 'mp3');

  if (!hasMp3) {
    const mp3Option = {
      format_id: 'mp3',
      quality: 'High Quality',
      filesize: currentOptions[0]?.filesize || 0,
      extension: 'mp3',
      fps: 'FAST',
      note: 'Universal Compatibility'
    };
    currentOptions = [mp3Option, ...currentOptions];
  }
  return currentOptions;
};

const MobileSpotifyPicker = ({ isOpen, onClose, videoData, onSelect }) => {
  const [options, setOptions] = useState([]);
  const [selectedQualityId, setSelectedQualityId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedArtist, setEditedArtist] = useState('');
  const [editedAlbum, setEditedAlbum] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);

  const dropdownRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    setOptions(getSpotifyOptions(videoData));
  }, [videoData]);

  useEffect(() => {
    if (isOpen && videoData) {
      setEditedTitle(videoData.title || '');
      setEditedArtist(videoData.artist || '');
      setEditedAlbum(videoData.album || '');
      setIsEditing(false);
      setIsDropdownOpen(false);

      if (options && options.length > 0) {
        setSelectedQualityId(options[0].format_id);
      }
    } else if (!isOpen) {
      setIsPlaying(false);
      setAudioProgress(0);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [options, isOpen, videoData]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = event => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  if (!videoData) return null;

  const selectedOption =
    options.find(o => o.format_id === selectedQualityId) || options[0];

  const formatSize = bytes => {
    if (!bytes) return 'Unknown size';
    const kb = bytes / 1024;
    const mb = kb / 1024;
    const gb = mb / 1024;

    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.round(kb)} KB`;
  };

  const getQualityLabel = quality => {
    if (!quality) return 'Unknown';
    // Strip '(Original Master)' for separate badge rendering
    return quality.replace(/\s*\(Original Master\)/i, '');
  };

  const handleDownloadClick = () => {
    onSelect(selectedQualityId, {
      title: editedTitle,
      artist: editedArtist,
      album: editedAlbum
    });
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className='fixed inset-0 z-[100002] flex items-center justify-center p-4'>
          {/* Backdrop Overlay - Click to close disabled per request */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className='absolute inset-0 bg-black/60 backdrop-blur-[2px]'
            style={{ zIndex: -1 }}
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className='relative w-full max-w-lg bg-gray-900 border border-cyan-500/30 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col max-h-[90vh]'
          >
            {/* Header / Close Button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className='absolute top-4 right-4 z-50 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/70 hover:text-white transition-colors cursor-pointer'
            >
              <X size={20} />
            </motion.button>

            {/* TOP PLAYER SECTION: Matching Desktop Music Card Layout */}
            <div className='relative w-full bg-[#0a0a0f] p-6 sm:p-8 overflow-hidden'>
              {/* VIBRANT ATMOSPHERE: Increased opacity for better visibility */}
              <div className='absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-transparent to-purple-600/25 pointer-events-none' />

              {/* EXTRA GLOW BLOOM: To make it look more modern/cyberpunk */}
              <div className='absolute -top-24 -left-24 w-64 h-64 bg-cyan-500/10 blur-[80px] pointer-events-none' />
              <div className='absolute -bottom-24 -right-24 w-64 h-64 bg-purple-500/15 blur-[80px] pointer-events-none' />

              {/* SMOOTH TRANSITION GRADIENT: Replicating the original modal's 'edge blur' */}
              <div className='absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent pointer-events-none' />

              <div className='relative z-10 flex items-center gap-5 sm:gap-8'>
                {/* Rotating Vinyl Disc */}
                <button
                  className='relative shrink-0 cursor-pointer group/disc focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded-full appearance-none border-none bg-transparent p-0 m-0'
                  onClick={() => {
                    if (isPlaying) audioRef.current.pause();
                    else audioRef.current.play();
                    setIsPlaying(!isPlaying);
                  }}
                  aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: isPlaying ? 10 : 60,
                      repeat: Infinity,
                      ease: 'linear'
                    }}
                    className='w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-[3px] border-cyan-300 p-1 shadow-[0_0_20px_rgba(6,182,212,0.5)] relative bg-cyan-500/10'
                  >
                    <div className='absolute inset-0 z-10 opacity-30 pointer-events-none bg-[repeating-radial-gradient(circle_at_center,_transparent_0,_transparent_2px,_rgba(255,255,255,0.05)_3px)]' />
                    <img
                      src={videoData.thumbnail}
                      alt='Album Art'
                      className='w-full h-full object-cover rounded-full'
                    />
                  </motion.div>

                  <div className='absolute inset-0 flex items-center justify-center pointer-events-none z-30'>
                    <div className='w-4 h-4 bg-gray-900 rounded-full border-2 border-white/5 shadow-inner' />
                  </div>
                </button>

                {/* Metadata & Secondary Controls */}
                <div className='flex-1 min-w-0'>
                  <h4 className='text-white text-lg sm:text-xl font-bold truncate tracking-tight mb-0.5'>
                    {editedTitle}
                  </h4>
                  <p className='text-cyan-400/80 text-sm font-medium truncate'>
                    {editedArtist}
                  </p>

                  <div className='mt-4 flex items-center gap-4'>
                    <button
                      onClick={() => {
                        if (isPlaying) audioRef.current.pause();
                        else audioRef.current.play();
                        setIsPlaying(!isPlaying);
                      }}
                      className='w-10 h-10 flex items-center justify-center rounded-full bg-cyan-400 text-black hover:scale-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] shrink-0'
                    >
                      {isPlaying ? (
                        <Pause size={18} fill='currentColor' />
                      ) : (
                        <Play
                          size={18}
                          fill='currentColor'
                          className='ml-0.5'
                        />
                      )}
                    </button>

                    <div className='flex-1 space-y-2'>
                      <div className='flex items-end gap-1 h-3 px-1'>
                        {[...Array(10)].map((_, i) => (
                          <motion.div
                            key={i}
                            animate={{ 
                              height: isPlaying 
                                ? [4, 10, 6, 12, 4] 
                                : [4, 8, 4], 
                              opacity: isPlaying 
                                ? [0.5, 1, 0.7, 1, 0.5] 
                                : [0.4, 0.7, 0.4] 
                            }}
                            transition={{ 
                              duration: isPlaying 
                                ? 1.2 + (i * 0.2) 
                                : 1.8 + (i * 0.2), 
                              repeat: Infinity, 
                              ease: "easeInOut",
                              delay: i * 0.1 
                            }}
                            className='w-1 bg-cyan-400 rounded-full'
                          />
                        ))}
                      </div>
                      <div className='h-1 w-full bg-white/10 rounded-full overflow-hidden'>
                        <motion.div
                          className='h-full bg-gradient-to-r from-cyan-400 to-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                          style={{ width: `${audioProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className='mt-4 flex items-center gap-2'>
                <Music2 size={12} className='text-purple-400 animate-pulse' />
                <span className='text-[10px] uppercase tracking-[0.2em] text-purple-300/60 font-black'>
                  Previewing Spotify Content
                </span>
              </div>

              {/* MODERN NEON SEPARATOR */}
              <div className='absolute bottom-0 left-0 right-0 h-px pointer-events-none z-10 overflow-hidden'>
                {/* Base subtle line */}
                <div className='w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent' />

                {/* Secondary themed gradient */}
                <div className='absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent' />

                {/* Refined Glowing Core with 'Living' Pulse */}
                <motion.div
                  animate={{
                    opacity: [0.3, 0.7, 0.3],
                    width: ['80px', '140px', '80px']
                  }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                  className='absolute top-0 left-1/2 -translate-x-1/2 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent blur-[1.5px]'
                />

                {/* Slow Shimmer Sweep - Restricted to center area with Ping-Pong effect */}
                <motion.div
                  animate={{ x: ['-60px', '60px'] }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    repeatType: 'reverse',
                    ease: 'easeInOut'
                  }}
                  className='absolute top-0 left-1/2 -translate-x-1/2 w-40 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent'
                />
              </div>
            </div>

            {/* BODY SECTION: EXACT Same as Original QualityPicker */}
            <div className='p-6 flex flex-col gap-4 overflow-y-visible relative'>
              <AnimatePresence mode='wait'>
                {!isEditing ? (
                  <motion.div
                    key='view-mode'
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className='flex flex-col gap-4'
                  >
                    {/* VIEW MODE: Format Line */}
                    <div className='flex justify-between items-start gap-3'>
                      <div className='flex-1 min-w-0'>
                        <div className='flex gap-3 items-center'>
                          <p className='text-gray-500 text-[10px] flex items-center gap-1'>
                            <Music className='text-cyan-400' size={13} />
                            Format:{' '}
                            <span className='text-gray-300 font-semibold'>
                              {selectedOption?.extension?.toUpperCase() || 'MP3'}
                            </span>
                          </p>
                          <button
                            onClick={() => setIsEditing(true)}
                            className='p-1 bg-white/5 hover:bg-white/10 rounded-md text-cyan-400 hover:text-cyan-300 border-[0.7px] transition-colors shrink-0 shadow-sm border border-cyan-400'
                          >
                            <SquarePen size={17} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quality Selection */}
                    <div className='space-y-2 mt-2 relative'>
                      <p className='text-cyan-400 text-[10px] font-black uppercase tracking-[0.15em] ml-1 opacity-80'>
                        Select Output Quality
                      </p>
                      {options.length > 0 ? (
                        <div className='flex gap-2.5 relative'>
                          <div className='flex-1' ref={dropdownRef}>
                            <motion.button
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                              className={`w-full h-full bg-white/5 border ${
                                isDropdownOpen
                                  ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                                  : 'border-white/10'
                              } rounded-2xl py-3.5 px-3 sm:px-4 text-white text-left focus:outline-none hover:bg-white/10 transition-all text-xs sm:text-sm font-bold flex items-center justify-between group overflow-hidden`}
                            >
                              <div className='flex flex-col min-w-0 flex-1 mr-2'>
                                <div className='flex items-center gap-2'>
                                  <span className='tracking-tight truncate'>
                                    {getQualityLabel(selectedOption?.quality)}
                                  </span>
                                  {selectedOption?.quality?.includes('(Original Master)') && (
                                    <span className='text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-black uppercase tracking-tighter shrink-0'>
                                      Original Master
                                    </span>
                                  )}
                                  {selectedOption?.fps && (
                                    <span className='text-[9px] px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-black uppercase tracking-tighter shrink-0'>
                                      {selectedOption.fps === 'FAST' ? 'FAST' : `${selectedOption.fps}fps`}
                                    </span>
                                  )}
                                </div>
                                <span className='text-[10px] text-cyan-400/60 font-medium mt-0.5 truncate'>
                                  {formatSize(selectedOption?.filesize)} • {selectedOption?.extension?.toUpperCase() || 'MP3'}
                                </span>
                              </div>
                              <ChevronDown
                                className={`text-gray-400 shrink-0 transition-all duration-500 ${
                                  isDropdownOpen
                                    ? 'rotate-180 text-cyan-400 scale-110'
                                    : 'group-hover:text-white'
                                }`}
                                size={18}
                              />
                            </motion.button>
                          </div>

                          <AnimatePresence>
                            {isDropdownOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                transition={{
                                  duration: 0.2,
                                  ease: [0.23, 1, 0.32, 1]
                                }}
                                className='absolute bottom-full left-0 w-full mb-3 bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/20 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7),0_0_20px_rgba(6,182,212,0.1)] z-[100] overflow-hidden'
                              >
                                <div className='px-4 py-3 border-b border-white/5 bg-white/5 backdrop-blur-md'>
                                  <span className='text-[9px] font-black text-cyan-400 uppercase tracking-[0.2em]'>
                                    Available Streams
                                  </span>
                                </div>
                                <div className='max-h-36 overflow-y-auto custom-scrollbar mb-4 mt-1 mx-1.5 py-1'>
                                  {options.map((option, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => {
                                        setSelectedQualityId(
                                          option.format_id
                                        );
                                        setIsDropdownOpen(false);
                                      }}
                                      className={`w-full px-4 py-1.5 text-left hover:bg-cyan-500/5 transition-all flex items-center justify-between group relative ${
                                        selectedQualityId === option.format_id
                                          ? 'text-cyan-400'
                                          : 'text-gray-300'
                                      }`}
                                    >
                                      <div className='flex flex-col relative z-10'>
                                        <div className='flex items-center gap-2'>
                                          <span className='text-sm font-bold whitespace-nowrap'>
                                            {getQualityLabel(option.quality)}
                                          </span>
                                          {option.quality?.includes('(Original Master)') && (
                                            <span className='text-[8px] px-1 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-black uppercase tracking-tighter shrink-0'>
                                              Original Master
                                            </span>
                                          )}
                                          {option.fps && (
                                            <span className='text-[8px] px-1 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-black uppercase tracking-tighter shrink-0'>
                                              {option.fps === 'FAST' ? 'FAST' : `${option.fps}fps`}
                                            </span>
                                          )}
                                        </div>
                                        <span className='text-[10px] text-cyan-400/40 group-hover:text-cyan-400/70 transition-colors font-medium mt-0.5'>
                                          {formatSize(option.filesize)} • {option.extension?.toUpperCase() || 'MP3'}
                                        </span>{' '}
                                      </div>
                                      {selectedQualityId ===
                                        option.format_id && (
                                        <Check size={12} strokeWidth={4} />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleDownloadClick}
                            className='bg-cyan-500 hover:bg-cyan-400 text-white px-4 sm:px-7 py-3 rounded-2xl flex items-center gap-2 font-black transition-all shadow-[0_10px_20px_rgba(6,182,212,0.3)] border border-cyan-400/30 shrink-0'
                          >
                            <Download size={22} strokeWidth={2.5} />
                            <span className='hidden sm:inline uppercase text-xs tracking-wider'>
                              Get File
                            </span>
                          </motion.button>
                        </div>
                      ) : (
                        <div className='text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10'>
                          <p className='text-gray-500 text-sm italic'>
                            No formats found for this link.
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key='edit-mode'
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className='flex flex-col gap-4'
                  >
                    {/* EDIT MODE: Inputs */}
                    <div className='flex flex-col gap-3'>
                      <div className='space-y-1'>
                        <label className='text-[10px] text-cyan-400 uppercase font-bold tracking-wider ml-1'>
                          Title
                        </label>
                        <input
                          value={editedTitle}
                          onChange={e => setEditedTitle(e.target.value)}
                          placeholder='Enter title'
                          className='w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:bg-black/40 transition-all placeholder-gray-600'
                        />
                      </div>

                      <div className='flex gap-3 items-center'>
                        <div className='space-y-1 flex-1'>
                          <label className='text-[10px] text-cyan-400 uppercase font-bold tracking-wider ml-1'>
                            Artist
                          </label>
                          <input
                            value={editedArtist}
                            onChange={e => setEditedArtist(e.target.value)}
                            placeholder='Enter artist'
                            className='w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:bg-black/40 transition-all placeholder-gray-600'
                          />
                        </div>
                        <div className='space-y-1 flex-1 mt-1.5'>
                          <div className='flex gap-1 text-gray-400 items-center'>
                            <label className='text-[10px] text-cyan-400 uppercase font-bold tracking-wider ml-1'>
                              Album
                            </label>
                            <p className='text-[9px]'>(optional)</p>
                          </div>
                          <input
                            value={editedAlbum}
                            onChange={e => setEditedAlbum(e.target.value)}
                            placeholder='Enter album'
                            className='w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:bg-black/40 transition-all placeholder-gray-600'
                          />
                        </div>
                      </div>
                    </div>

                    {/* Save Actions */}
                    <div className='flex gap-3 mt-2'>
                      <button
                        onClick={() => {
                          setEditedTitle(videoData.title || '');
                          setEditedArtist(videoData.artist || '');
                          setEditedAlbum(videoData.album || '');
                          setIsEditing(false);
                        }}
                        className='flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium'
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className='flex-1 bg-cyan-500 hover:bg-cyan-400 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-cyan-500/20 text-sm flex items-center justify-center gap-1'
                      >
                        <Check size={16} strokeWidth={4} />
                        Save Changes
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className='p-4 border-t border-white/5 bg-black/20 flex flex-col items-center gap-1'>
              {!isEditing ? (
                <>
                  <p className='text-[10px] text-gray-500 text-center leading-tight'>
                    Original Quality: Available
                    <br />
                    <span className='text-cyan-500/80'>
                      Learn about format differences.&nbsp;
                      <a
                        href='/formats.html'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='underline font-bold hover:text-cyan-400 transition-colors'
                      >
                        Read guide
                      </a>
                    </span>
                  </p>
                </>
              ) : (
                <p className='text-[10px] text-gray-500'>
                  Changes will update file info when you download.
                </p>
              )}
            </div>

            <audio
              ref={audioRef}
              src={videoData.spotifyMetadata.previewUrl}
              onTimeUpdate={() => {
                const duration = audioRef.current.duration;
                if (duration > 0)
                  setAudioProgress(
                    (audioRef.current.currentTime / duration) * 100
                  );
              }}
              onEnded={() => {
                setIsPlaying(false);
                setAudioProgress(0);
              }}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default MobileSpotifyPicker;