import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Music,
  SquarePen,
  ListMusic
} from 'lucide-react';
import { createPortal } from 'react-dom';
import FormatIcon from '../../assets/icons/FormatIcon.jsx';
import { formatSize, getQualityLabel } from '../../lib/utils';
import ModalHeader from './ModalHeader.jsx';
import { QualitySelectionShared, EditModeUIShared } from './SharedComponents.jsx';

const getInitialOptions = (selectedFormat = 'mp3', videoData = {}) => {
  try {
    if (!videoData) return [];
    
    const formats = Array.isArray(videoData?.formats) ? videoData.formats : [];
    const audioFormats = Array.isArray(videoData?.audioFormats) ? videoData.audioFormats : [];
    const currentOptions = [...(selectedFormat === 'mp4' ? formats : audioFormats)];

    if (selectedFormat !== 'mp4') {
        const hasMp3 = currentOptions.some(o => o?.format_id === 'mp3');
        
        if (!hasMp3 && currentOptions.length > 0) {
            const calculatedSize = (videoData?.duration && !Number.isNaN(Number(videoData.duration))) 
              ? Math.round(videoData.duration * 24000) 
              : (currentOptions[0]?.filesize || 0);
              
            const mp3Option = {
                format_id: 'mp3',
                quality: 'High Quality',
                filesize: calculatedSize,
                extension: 'mp3',
                fps: 'FAST',
                note: 'Universal Compatibility'
            };
            return [mp3Option, ...currentOptions];
        }
    }
    return currentOptions;
  } catch (e) {
    console.error('[Picker] Safety fallback triggered:', e);
    return [];
  }
};

const ThumbnailSection = ({ thumbnail, selectedFormat }) => (
  <div className='relative w-full aspect-video overflow-hidden group'>
    <img
      src={thumbnail}
      alt='Thumbnail'
      className='w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 rounded-2xl'
    />
    <div className='absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent' />
    <div className='absolute inset-0 flex items-center justify-center'>
      <div className='w-16 h-16 bg-cyan-500/20 backdrop-blur-md rounded-full flex items-center justify-center border border-cyan-500/30'>
        {selectedFormat === 'mp4' ? (
          <Play className='text-cyan-400 fill-cyan-400 ml-1' size={32} />
        ) : (
          <ListMusic className='text-cyan-400 fill-cyan-400 ml-1' size={32} />
        )}
      </div>
    </div>
  </div>
);

const StandardQualityPicker = ({
  isOpen,
  onClose,
  selectedFormat = 'mp4',
  videoData,
  onSelect
}) => {
  const [options, setOptions] = useState([]);
  const [selectedQualityId, setSelectedQualityId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedArtist, setEditedArtist] = useState('');
  const [editedAlbum, setEditedAlbum] = useState('');

  const dropdownRef = useRef(null);

  useEffect(() => {
      setOptions(getInitialOptions(selectedFormat, videoData));
  }, [selectedFormat, videoData]);

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
    }
  }, [options, isOpen, videoData]);

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

  let safeOptions = [];
  let selectedOption = null;
  
  try {
    safeOptions = Array.isArray(options) ? options : [];
    selectedOption = safeOptions.length > 0 
      ? (safeOptions.find(o => o?.format_id === selectedQualityId) || safeOptions[0]) 
      : null;
  } catch (e) {
    console.warn('[Picker] Error calculating options:', e);
  }

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
          className='fixed inset-0 flex items-center justify-center p-4'
          style={{ zIndex: 99999 }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className='absolute inset-0 bg-black/60 backdrop-blur-[2px]'
            style={{ zIndex: -1, willChange: 'opacity' }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className='relative w-full max-w-lg bg-gray-900 border border-cyan-500/30 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col max-h-[90vh]'
            style={{ willChange: 'transform, opacity' }}
          >
            <ModalHeader onClose={onClose} />
            <ThumbnailSection thumbnail={videoData.thumbnail} selectedFormat={selectedFormat} />

            <div className='p-6 flex flex-col gap-4 overflow-y-visible relative'>
              <AnimatePresence mode='wait'>
                {!isEditing ? (
                  <motion.div key='view-mode' initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className='flex flex-col gap-4'>
                    <div className='flex justify-between items-start gap-3'>
                      <div className='flex-1 min-w-0'>
                        <h3 className='text-white font-bold text-lg leading-tight line-clamp-2 break-words' title={editedTitle}>{editedTitle}</h3>
                        <p className='text-gray-400 text-xs mt-1 font-medium truncate'>
                          {editedArtist || (selectedFormat === 'mp4' ? 'Unknown Author' : 'Unknown Artist')} {editedAlbum ? `• ${editedAlbum}` : ''}
                        </p>
                        <div className='flex gap-3 items-center'>
                          <p className='text-gray-500 text-[10px] flex items-center gap-1 mt-2'>
                            {selectedFormat === 'mp4' ? <FormatIcon size={14} /> : <Music className='text-cyan-400' size={13} />}
                            Format: <span className='text-gray-300 font-semibold'>{selectedFormat.toUpperCase()}</span>
                          </p>
                          <button onClick={() => setIsEditing(true)} className='p-1 bg-white/5 hover:bg-white/10 rounded-md mt-1 text-cyan-400 hover:text-cyan-300 border-[0.7px] transition-colors shrink-0 shadow-sm border border-cyan-400'><SquarePen size={17} /></button>
                        </div>
                      </div>
                    </div>

                    <QualitySelectionShared 
                      options={options} isDropdownOpen={isDropdownOpen} setIsDropdownOpen={setIsDropdownOpen}
                      selectedOption={selectedOption} setSelectedQualityId={setSelectedQualityId}
                      handleDownloadClick={handleDownloadClick} dropdownRef={dropdownRef}
                      selectedQualityId={selectedQualityId}
                      isPartial={videoData?.isPartial}
                    />
                  </motion.div>
                ) : (
                  <EditModeUIShared 
                    editedTitle={editedTitle} setEditedTitle={setEditedTitle}
                    editedArtist={editedArtist} setEditedArtist={setEditedArtist}
                    editedAlbum={editedAlbum} setEditedAlbum={setEditedAlbum}
                    selectedFormat={selectedFormat} videoData={videoData}
                    setIsEditing={setIsEditing}
                  />
                )}
              </AnimatePresence>
            </div>

            <div className='p-4 border-t border-white/5 bg-black/20 flex flex-col items-center gap-1'>
              {!isEditing ? (
                <>
                  <p className='text-[10px] text-gray-500 text-center leading-tight'>
                    {videoData?.isPartial ? 'Authoritative Stream Identification in Progress...' : 'Original Quality: Available'}
                    <br />
                    {selectedFormat === 'mp3' && (
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

export default StandardQualityPicker;
