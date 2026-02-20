import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Music, SquarePen, Music2 } from "lucide-react";
import { createPortal } from "react-dom";
import ModalHeader from "./ModalHeader.jsx";
import { QualitySelectionShared, EditModeUIShared } from "./SharedComponents.jsx";
import PropTypes from "prop-types";

const getSpotifyOptions = videoData => {
  if (!videoData)
    return [];

  const rawOptions = videoData?.audioFormats;
  const currentOptions = Array.isArray(rawOptions) ? [...rawOptions] : [];

  const hasMp3 = currentOptions.some(o => o?.format_id === "mp3");

  if (!hasMp3) {
    const calculatedSize = (videoData?.duration && !Number.isNaN(Number(videoData.duration))) ? Math.round(videoData.duration * 24000) : (currentOptions[0]?.filesize || 0);

    const mp3Option = {
      format_id: "mp3",
      quality: "High Quality",
      filesize: calculatedSize,
      extension: "mp3",
      fps: "FAST",
      note: "Universal Compatibility"
    };
    return [mp3Option, ...currentOptions];
  }
  return currentOptions;
};

const VinylPlayer = (
  {
    videoData,
    isPlaying,
    onTogglePlay,
    audioRef,
    editedTitle,
    editedArtist,
    audioProgress
  }
) => (<div className="relative w-full bg-[#0a0a0f] p-6 sm:p-8 overflow-hidden">
  <div
    className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-transparent to-purple-600/25 pointer-events-none" />
  <div
    className="absolute -top-24 -left-24 w-64 h-64 bg-cyan-500/10 blur-[80px] pointer-events-none" />
  <div
    className="absolute -bottom-24 -right-24 w-64 h-64 bg-purple-500/15 blur-[80px] pointer-events-none" />
  <div
    className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent pointer-events-none" />
  <div className="relative z-10 flex items-center gap-5 sm:gap-8">
    <button
      className="relative shrink-0 cursor-pointer group/disc focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded-full appearance-none border-none bg-transparent p-0 m-0"
      onClick={onTogglePlay}
      aria-label={isPlaying ? "Pause preview" : "Play preview"}>
      <motion.div
        animate={{
          rotate: 360
        }}
        transition={{
          duration: isPlaying ? 10 : 60,
          repeat: Infinity,
          ease: "linear"
        }}
        className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-[3px] border-cyan-300 p-1 shadow-[0_0_20px_rgba(6,182,212,0.5)] relative bg-cyan-500/10">
        <div
          className="absolute inset-0 z-10 opacity-30 pointer-events-none bg-[repeating-radial-gradient(circle_at_center,_transparent_0,_transparent_2px,_rgba(255,255,255,0.05)_3px)]" />
        <img
          src={videoData.cover || videoData.thumbnail}
          alt="Album Art"
          className="w-full h-full object-cover rounded-full" />
      </motion.div>
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
        <div
          className="w-4 h-4 bg-gray-900 rounded-full border-2 border-white/5 shadow-inner" />
      </div>
    </button>
    <div className="flex-1 min-w-0">
      <h4
        className="text-white text-lg sm:text-xl font-bold truncate tracking-tight mb-0.5">{editedTitle}</h4>
      <p className="text-cyan-400/80 text-sm font-medium truncate">{editedArtist}</p>
      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={onTogglePlay}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-cyan-400 text-black hover:scale-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] shrink-0">
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>
        <div className="flex-1 space-y-2">
          <div className="flex items-end gap-1 h-3 px-1">
            {[...Array(10)].map((_, i) => (<motion.div
              key={i}
              animate={{
                height: isPlaying ? [4, 10, 6, 12, 4] : [4, 8, 4],
                opacity: isPlaying ? [0.5, 1, 0.7, 1, 0.5] : [0.4, 0.7, 0.4]
              }}
              transition={{
                duration: isPlaying ? 1.2 + (i * 0.2) : 1.8 + (i * 0.2),
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.1
              }}
              className="w-1 bg-cyan-400 rounded-full" />))}
          </div>
          <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]"
              style={{
                width: `${audioProgress}%`
              }} />
          </div>
        </div>
      </div>
    </div>
  </div>
  <div className="mt-4 flex items-center gap-2">
    <Music2 size={12} className="text-purple-400 animate-pulse" />
    <span
      className="text-[10px] uppercase tracking-[0.2em] text-purple-300/60 font-black">Previewing Spotify Content</span>
  </div>
  <div
    className="absolute bottom-0 left-0 right-0 h-px pointer-events-none z-10 overflow-hidden">
    <div
      className="w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    <div
      className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
    <motion.div
      animate={{
        opacity: [0.3, 0.7, 0.3],
        width: ["80px", "140px", "80px"]
      }}
      transition={{
        duration: 2.5,
        repeat: Infinity,
        ease: "easeInOut"
      }}
      className="absolute top-0 left-1/2 -translate-x-1/2 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent blur-[1.5px]" />
  </div>
</div>);

const MobileSpotifyPicker = (
  {
    isOpen,
    onClose,
    videoData,
    onSelect
  }
) => {
  const [options, setOptions] = useState([]);
  const [selectedQualityId, setSelectedQualityId] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedArtist, setEditedArtist] = useState("");
  const [editedAlbum, setEditedAlbum] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);

  const audioRef = useRef(null);
  const dropdownRef = useRef(null);
  
  const lastSrcRef = useRef("");

  useEffect(() => {
    const currentSrc = videoData?.previewUrl || videoData?.spotifyMetadata?.previewUrl;
    if (isOpen && audioRef.current && currentSrc && currentSrc !== lastSrcRef.current) {
      console.log(`[Picker] Audio Source Identified: ${currentSrc.substring(0, 50)}...`);
      lastSrcRef.current = currentSrc;
      setIsPlaying(false);
    }
  }, [videoData?.previewUrl, videoData?.spotifyMetadata?.previewUrl, isOpen]);

  useEffect(() => {
    setOptions(getSpotifyOptions(videoData));
  }, [videoData]);

  useEffect(() => {
    if (isOpen && videoData) {
      setEditedTitle(videoData.title || "");
      setEditedArtist(videoData.artist || "");
      setEditedAlbum(videoData.album || "");
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

  useEffect(() => {
    const handleClickOutside = event => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  if (!videoData)
    return null;

  let safeOptions = [];
  let selectedOption = null;

  try {
    safeOptions = Array.isArray(options) ? options : [];
    selectedOption = safeOptions.length > 0 ? (safeOptions.find(o => o?.format_id === selectedQualityId) || safeOptions[0]) : null;
  } catch (e) {
    console.warn("[Picker] Error calculating options:", e);
  }

  const handleDownloadClick = () => {
    onSelect(selectedQualityId, {
      title: editedTitle,
      artist: editedArtist,
      album: editedAlbum
    });
  };

  const modalContent = (<AnimatePresence>
    {isOpen && (<div className="fixed inset-0 z-[100002] flex items-center justify-center p-4">
      <motion.div
        initial={{
          opacity: 0
        }}
        animate={{
          opacity: 1
        }}
        exit={{
          opacity: 0
        }}
        transition={{
          duration: 0.2
        }}
        className="absolute inset-0 bg-black/60"
        style={{
          zIndex: -1
        }} />
      <motion.div
        initial={{
          opacity: 0,
          scale: 0.95,
          y: 10
        }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0
        }}
        exit={{
          opacity: 0,
          scale: 0.95,
          y: 10
        }}
        transition={{
          duration: 0.25,
          ease: [0.23, 1, 0.32, 1]
        }}
        className="relative w-full max-w-lg bg-gray-900 border border-cyan-500/30 rounded-3xl overflow-visible shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col max-h-[90vh]">
        <ModalHeader onClose={onClose} />
        <VinylPlayer
          videoData={videoData}
          isPlaying={isPlaying}
          onTogglePlay={() => {
            if (audioRef.current) {
              if (isPlaying)
                audioRef.current.pause();
              else
                audioRef.current.play();
              setIsPlaying(!isPlaying);
            }
          }}
          audioRef={audioRef}
          editedTitle={editedTitle}
          editedArtist={editedArtist}
          audioProgress={audioProgress} />
        <div className="p-6 flex flex-col gap-4 overflow-y-visible relative">
          <AnimatePresence mode="wait">
            {isEditing ? (<EditModeUIShared
              editedTitle={editedTitle}
              setEditedTitle={setEditedTitle}
              editedArtist={editedArtist}
              setEditedArtist={setEditedArtist}
              editedAlbum={editedAlbum}
              setEditedAlbum={setEditedAlbum}
              videoData={videoData}
              setIsEditing={setIsEditing}
              isSpotify={true} />) : (<motion.div
              key="view-mode"
              initial={{
                opacity: 0,
                x: -20
              }}
              animate={{
                opacity: 1,
                x: 0
              }}
              exit={{
                opacity: 0,
                x: 20
              }}
              className="flex flex-col gap-4">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex gap-3 items-center">
                    <p className="text-gray-500 text-[10px] flex items-center gap-1"><Music className="text-cyan-400" size={13} />Format: <span className="text-gray-300 font-semibold">{selectedOption?.extension?.toUpperCase() || "MP3"}</span></p>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1 bg-white/5 hover:bg-white/10 rounded-md text-cyan-400 hover:text-cyan-300 border-[0.7px] transition-colors shrink-0 shadow-sm border border-cyan-400"><SquarePen size={17} /></button>
                  </div>
                </div>
              </div>
              <QualitySelectionShared
                options={options}
                isDropdownOpen={isDropdownOpen}
                setIsDropdownOpen={setIsDropdownOpen}
                selectedOption={selectedOption}
                setSelectedQualityId={setSelectedQualityId}
                handleDownloadClick={handleDownloadClick}
                dropdownRef={dropdownRef}
                selectedQualityId={selectedQualityId}
                isPartial={videoData?.isPartial}
                isMobile={true} />
            </motion.div>)}
          </AnimatePresence>
        </div>
        <div
          className="p-4 border-t border-white/5 bg-black/20 flex flex-col items-center gap-1">
          {!isEditing ? (<>
            <p className="text-[10px] text-gray-500 text-center leading-tight">Original Quality: Available
                                  <br />
              <span className="text-cyan-500/80">Learn about format differences.
                                      <a
                  href="/formats.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold hover:text-cyan-400 transition-colors">Read guide
                                        </a>
              </span>
            </p>
          </>) : (<p className="text-[10px] text-gray-500">Changes will update file info when you download.
                            </p>)}
        </div>
        <audio
          ref={audioRef}
          src={videoData.previewUrl || videoData.spotifyMetadata?.previewUrl}
          onTimeUpdate={() => {
            const duration = audioRef.current.duration;
            if (duration > 0)
              setAudioProgress((audioRef.current.currentTime / duration) * 100);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setAudioProgress(0);
          }} />
      </motion.div>
    </div>)}
  </AnimatePresence>);

  return createPortal(modalContent, document.body);
};

MobileSpotifyPicker.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  videoData: PropTypes.object,
  onSelect: PropTypes.func.isRequired
};

export default MobileSpotifyPicker;
