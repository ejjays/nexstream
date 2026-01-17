import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  Download,
  Music,
  Video,
  Monitor,
  ChevronDown,
  Pencil,
  Check
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
  const [editedTitle, setEditedTitle] = useState('');
  const [editedArtist, setEditedArtist] = useState('');
  const [editedAlbum, setEditedAlbum] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEditedTitle(videoData.title || '');
      setEditedArtist(videoData.artist || '');
      setEditedAlbum(videoData.album || '');
      setIsEditing(false);

      if (options && options.length > 0) {
        setSelectedQualityId(options[0].format_id);
      }
    }
  }, [options, isOpen, videoData]);

  const formatSize = bytes => {
    if (!bytes) return 'Unknown size';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
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
            onClick={onClose}
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
                  <Play
                    className='text-cyan-400 fill-cyan-400 ml-1'
                    size={32}
                  />
                </div>
              </div>
            </div>

            {/* Info & List Section */}
            <div className='p-6 flex flex-col gap-4 overflow-y-auto custom-scrollbar relative'>
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
                      <div className='flex-1'>
                        <h3
                          className='text-white font-bold text-lg leading-tight line-clamp-2'
                          title={editedTitle}
                        >
                          {editedTitle}
                        </h3>
                        <p className='text-gray-400 text-xs mt-1 font-medium'>
                          {editedArtist ||
                            (selectedFormat === 'mp4'
                              ? 'Unknown Author'
                              : 'Unknown Artist')}{' '}
                          {editedAlbum ? `• ${editedAlbum}` : ''}
                        </p>
                        <p className='text-gray-500 text-[10px] flex items-center gap-1 mt-2'>
                          {selectedFormat === 'mp4' ? (
                            <FormatIcon size={14} />
                          ) : (
                            <Music size={12} />
                          )}
                          Format:{' '}
                          <span className='text-gray-300 font-semibold'>
                            {selectedFormat.toUpperCase()}
                          </span>
                        </p>
                      </div>

                      <button
                        onClick={() => setIsEditing(true)}
                        className='p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-cyan-400 hover:text-cyan-300 transition-colors shrink-0 shadow-sm border border-white/5'
                      >
                        <Pencil size={18} />
                      </button>
                    </div>

                    {/* Quality Selection */}
                    <div className='space-y-2 mt-2'>
                      <p className='text-cyan-400 text-[10px] font-bold uppercase tracking-wider'>
                        Select Quality
                      </p>
                      {options.length > 0 ? (
                        <div className='flex gap-2'>
                          <div className='relative flex-1 group'>
                            <select
                              value={selectedQualityId}
                              onChange={e =>
                                setSelectedQualityId(e.target.value)
                              }
                              className='w-full h-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-4 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500/50 hover:bg-white/10 transition-all text-sm font-medium'
                            >
                              {options.map((option, idx) => (
                                <option
                                  key={idx}
                                  value={option.format_id}
                                  className='bg-gray-900 text-white'
                                >
                                  {getQualityLabel(option.quality)}{' '}
                                  {option.fps ? `(${option.fps}fps)` : ''} —{' '}
                                  {formatSize(option.filesize)}
                                </option>
                              ))}
                            </select>
                            <ChevronDown
                              className='absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-cyan-400 transition-colors pointer-events-none'
                              size={18}
                            />
                          </div>

                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleDownloadClick}
                            className='bg-cyan-500 hover:bg-cyan-400 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold transition-all shadow-lg shadow-cyan-500/20 border border-cyan-400/30'
                          >
                            <Download size={20} />
                            <span className='hidden sm:inline'>Download</span>
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
            <div className='p-4 border-t border-white/5 bg-black/20 flex justify-center'>
              <p className='text-[10px] text-gray-500'>
                {!isEditing
                  ? 'Choose your preferred quality to start the process'
                  : 'Changes will update file info when you download.'}
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default QualityPicker;
