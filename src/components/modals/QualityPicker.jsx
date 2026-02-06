import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  Download,
  Music,
  Video,
  Monitor,
  ChevronDown,
  SquarePen,
  Check,
  ListMusic
} from 'lucide-react';
import { createPortal } from 'react-dom';
import FormatIcon from '../../assets/icons/FormatIcon.jsx';

const QualityPicker = ({
  isOpen,
  onClose,
  selectedFormat = 'mp4',
  videoData,
  onSelect
}) => {
  if (!videoData) return null;

  const options =
    selectedFormat === 'mp4' ? videoData.formats : videoData.audioFormats;

  const [selectedQualityId, setSelectedQualityId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedArtist, setEditedArtist] = useState('');
  const [editedAlbum, setEditedAlbum] = useState('');

  const dropdownRef = useRef(null);

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

  useEffect(() => {
    if (isOpen) {
      setEditedTitle(videoData.title || '');
      setEditedArtist(videoData.artist || '');
      setEditedAlbum(videoData.album || '');
      setIsEditing(false);
      setIsDropdownOpen(false);

      if (options && options.length > 0) {
        setSelectedQualityId(options[0].format_id);
      }
    }
  }, [options, isOpen, videoData]);

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
    // Map high resolutions to common names
    if (quality.includes('4320')) return '8K';
    if (quality.includes('2160')) return '4K';
    if (quality.includes('1440')) return '2K';
    return quality;
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
        <div
          className='fixed inset-0 z-[999] flex items-center justify-center p-4'
          style={{ zIndex: 99999 }}
        >
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className='absolute inset-0 bg-black/80 backdrop-blur-[2px]'
            style={{ zIndex: -1, willChange: 'opacity' }}
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className='relative w-full max-w-lg bg-gray-900 border border-cyan-500/30 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col max-h-[90vh]'
            style={{ willChange: 'transform, opacity' }}
          >
            {/* Header / Close Button */}
            <button
              onClick={onClose}
              className='absolute top-4 right-4 z-10 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/70 hover:text-white transition-colors'
            >
              <X size={20} />
            </button>

            {/* Thumbnail Section */}
            <div className='relative w-full aspect-video overflow-hidden group'>
              <img
                src={videoData.thumbnail}
                alt='Thumbnail'
                className='w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 rounded-2xl'
              />
              <div className='absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent' />
              <div className='absolute inset-0 flex items-center justify-center'>
                <div className='w-16 h-16 bg-cyan-500/20 backdrop-blur-md rounded-full flex items-center justify-center border border-cyan-500/30'>
                  {selectedFormat === 'mp4' ? (
                    <Play
                      className='text-cyan-400 fill-cyan-400 ml-1'
                      size={32}
                    />
                  ) : (
                    <ListMusic
                      className='text-cyan-400 fill-cyan-400 ml-1'
                      size={32}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Info & List Section */}
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
                    {/* VIEW MODE: Title & Artist */}
                    <div className='flex justify-between items-start gap-3'>
                      <div className='flex-1 min-w-0'>
                        <h3
                          className='text-white font-bold text-lg leading-tight line-clamp-2 break-words'
                          title={editedTitle}
                        >
                          {editedTitle}
                        </h3>
                        <p className='text-gray-400 text-xs mt-1 font-medium truncate'>
                          {editedArtist ||
                            (selectedFormat === 'mp4'
                              ? 'Unknown Author'
                              : 'Unknown Artist')}{' '}
                          {editedAlbum ? `• ${editedAlbum}` : ''}
                        </p>
                        <div className='flex gap-3 items-center'>
                          <p className='text-gray-500 text-[10px] flex items-center gap-1 mt-2'>
                            {selectedFormat === 'mp4' ? (
                              <FormatIcon size={14} />
                            ) : (
                              <Music className='text-cyan-400' size={13} />
                            )}
                            Format:{' '}
                            <span className='text-gray-300 font-semibold'>
                              {selectedFormat.toUpperCase()}
                            </span>
                          </p>
                          <button
                            onClick={() => setIsEditing(true)}
                            className='p-1 bg-white/5 hover:bg-white/10 rounded-md mt-1 text-cyan-400 hover:text-cyan-300 border-[0.7px] transition-colors shrink-0 shadow-sm border border-cyan-400'
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
                          <div className='relative flex-1' ref={dropdownRef}>
                            {/* Custom Dropdown Trigger */}
                            <motion.button
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                              className={`w-full h-full bg-white/5 border ${
                                isDropdownOpen
                                  ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                                  : 'border-white/10'
                              } rounded-2xl py-3.5 px-4 text-white text-left focus:outline-none hover:bg-white/10 transition-all text-sm font-bold flex items-center justify-between group`}
                            >
                              <div className='flex flex-col'>
                                <div className='flex items-center gap-2'>
                                  <span className='tracking-tight'>
                                    {getQualityLabel(selectedOption?.quality)}
                                  </span>
                                  {selectedOption?.fps && (
                                    <span className='text-[9px] px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-black uppercase tracking-tighter'>
                                      {selectedOption.fps}fps
                                    </span>
                                  )}
                                </div>
                                <span className='text-[10px] text-cyan-400/60 font-medium mt-0.5'>
                                  {formatSize(selectedOption?.filesize)} •{' '}
                                  {selectedFormat === 'mp4'
                                    ? 'MP4'
                                    : selectedOption?.extension?.toUpperCase() ||
                                      'RAW'}
                                </span>
                              </div>
                              <ChevronDown
                                className={`text-gray-400 transition-all duration-500 ${
                                  isDropdownOpen
                                    ? 'rotate-180 text-cyan-400 scale-110'
                                    : 'group-hover:text-white'
                                }`}
                                size={20}
                              />
                            </motion.button>

                            {/* Custom Dropdown Menu (Glassmorphism) */}
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
                                  className='absolute bottom-full left-0 w-[calc(100%+80px)] sm:w-full mb-3 bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/20 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7),0_0_20px_rgba(6,182,212,0.1)] z-[100] overflow-hidden'
                                >
                                  <div className='max-h-60 overflow-y-auto custom-scrollbar py-2'>
                                    <div className='px-4 py-2 border-b border-white/5 mb-1 bg-white/5 sticky top-0 z-20 backdrop-blur-md'>
                                      <span className='text-[9px] font-black text-cyan-400 uppercase tracking-[0.2em]'>
                                        Available Streams
                                      </span>
                                    </div>
                                    {options.map((option, idx) => (
                                      <button
                                        key={idx}
                                        onClick={() => {
                                          setSelectedQualityId(
                                            option.format_id
                                          );
                                          setIsDropdownOpen(false);
                                        }}
                                        className={`w-full px-4 py-3 text-left hover:bg-cyan-500/5 transition-all flex items-center justify-between group relative ${
                                          selectedQualityId === option.format_id
                                            ? 'text-cyan-400'
                                            : 'text-gray-300'
                                        }`}
                                      >
                                        {selectedQualityId ===
                                          option.format_id && (
                                          <motion.div
                                            layoutId='active-bg'
                                            className='absolute inset-0 bg-cyan-500/10 border-l-2 border-cyan-500'
                                          />
                                        )}

                                        <div className='flex flex-col relative z-10'>
                                          <div className='flex items-center gap-2'>
                                            <span className='text-sm font-bold'>
                                              {getQualityLabel(option.quality)}
                                            </span>
                                            {option.fps && (
                                              <span className='text-[8px] opacity-40 group-hover:opacity-100 transition-opacity font-bold bg-white/5 px-1 rounded'>
                                                {option.fps} FPS
                                              </span>
                                            )}
                                          </div>
                                          <span className='text-[10px] text-cyan-400/40 group-hover:text-cyan-400/70 transition-colors font-medium mt-0.5'>
                                            {formatSize(option.filesize)} •{' '}
                                            {selectedFormat === 'mp4'
                                              ? 'MP4'
                                              : option.extension?.toUpperCase() ||
                                                'RAW'}
                                          </span>{' '}
                                        </div>

                                        {selectedQualityId ===
                                          option.format_id && (
                                          <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className='bg-cyan-500/20 p-1 rounded-full relative z-10'
                                          >
                                            <Check size={12} strokeWidth={4} />
                                          </motion.div>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleDownloadClick}
                            className='bg-cyan-500 hover:bg-cyan-400 text-white px-7 py-3 rounded-2xl flex items-center gap-2 font-black transition-all shadow-[0_10px_20px_rgba(6,182,212,0.3)] border border-cyan-400/30 shrink-0'
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
                            {selectedFormat === 'mp4' ? 'Author' : 'Artist'}
                          </label>
                          <input
                            value={editedArtist}
                            onChange={e => setEditedArtist(e.target.value)}
                            placeholder={
                              selectedFormat === 'mp4'
                                ? 'Enter author'
                                : 'Enter artist'
                            }
                            className='w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:bg-black/40 transition-all placeholder-gray-600'
                          />
                        </div>
                        {selectedFormat !== 'mp4' && (
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
                        )}
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

            {/* Footer - Only show in View Mode */}
            <div className='p-4 border-t border-white/5 bg-black/20 flex flex-col items-center gap-1'>
              {!isEditing ? (
                <>
                  <p className='text-[10px] text-gray-500 text-center leading-tight'>
                    Original Quality: Available
                    <br />
                    {selectedFormat === 'mp3' && (
                      <span className='text-cyan-500/80'>
                        webm format may not play on all devices.&nbsp;
                        <a
                          href='/formats.html'
                          target='_blank'
                          rel='noopener noreferrer'
                          className='underline font-bold hover:text-cyan-400 transition-colors'
                        >
                          Read guide
                        </a>
                      </span>
                    )}
                  </p>
                </>
              ) : (
                <p className='text-[10px] text-gray-500'>
                  Changes will update file info when you download.
                </p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default QualityPicker;
