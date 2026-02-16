import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Play, Pause, Music2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

const MusicPlayerCard = ({ isVisible, data, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);
  const controls = useAnimation();

  // --- Interactive Motion Logic ---
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseX = useSpring(x, { stiffness: 150, damping: 20 });
  const mouseY = useSpring(y, { stiffness: 150, damping: 20 });

  const rotateX = useTransform(mouseY, [-100, 100], [8, -8]);
  const rotateY = useTransform(mouseX, [-100, 100], [-8, 8]);
  
  const reflectionX = useTransform(mouseX, [-150, 150], [15, -15]);
  const reflectionY = useTransform(mouseY, [-150, 150], [15, -15]);

  const hasPreview = !!data?.previewUrl;

  const togglePlay = () => {
    if (!hasPreview) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    if (!isVisible) {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [isVisible]);

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Toggle play/pause on Space key
      if ((e.code === 'Space' || e.key === ' ') && isVisible && hasPreview) {
        // Check if user is typing in an input or textarea
        const activeElement = document.activeElement;
        const isTyping = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable;
        
        if (!isTyping) {
          e.preventDefault();
          togglePlay();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, hasPreview, isPlaying]); // Re-bind when these change to ensure correct state in closure

  const handleDragEnd = (event, info) => {
    const screenWidth = window.innerWidth;
    const cardWidth = 320; 
    const margin = 16; 
    const isLeft = info.point.x < screenWidth / 2;
    
    if (isLeft) {
      const targetX = -(screenWidth - cardWidth - margin * 2);
      controls.start({ x: targetX, transition: { type: 'spring', stiffness: 300, damping: 30 } });
    } else {
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } });
    }
  };

  const handleTimeUpdate = () => {
    const duration = audioRef.current.duration;
    const currentTime = audioRef.current.currentTime;
    if (duration > 0) setProgress((currentTime / duration) * 100);
  };

  if (typeof document === 'undefined') return null;

  const playerContent = (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          drag
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          animate={controls}
          initial={{ opacity: 0, y: 50, scale: 0.9, x: 0 }}
          whileInView={{ opacity: 1, y: 0, scale: 1, x: 0 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          className="fixed bottom-4 right-4 z-[200000] hidden md:block cursor-grab active:cursor-grabbing touch-none outline-none"
        >
          <div className="relative group w-80 outline-none">
            {/* Original GitHub Cyberpunk Glow Background */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-[1.5rem] blur opacity-25 group-hover:opacity-45 transition duration-1000"></div>

            {/* Main Glass Shell - Original GitHub bg-black/75 with Liquid Blur */}
            <div className="relative w-full rounded-[1.5rem] bg-black/75 backdrop-blur-[45px] backdrop-saturate-[150%] border border-white/10 shadow-2xl overflow-hidden outline-none">
              
              {/* Static Surface Reflection */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/5 pointer-events-none z-20" />

              {/* Content Container */}
              <div className="relative w-full p-3.5 pt-6 transition-colors duration-500 hover:bg-white/[0.02] outline-none">
                
                {/* Refined Glass Edge Light */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

                {/* Drag Handle */}
                <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full group-hover:bg-white/40 transition-all duration-500" />

                <button 
                  onClick={onClose}
                  className="absolute top-2.5 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-white/10 z-30 outline-none"
                >
                  <X size={12} />
                </button>

                <div className="flex items-center gap-4 relative z-10">
                  <div className="relative shrink-0">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: isPlaying ? 10 : 60, repeat: Infinity, ease: "linear" }}
                      style={{ transformZ: 0 }} // Force hardware acceleration
                      className={`w-14 h-14 rounded-full overflow-hidden border-2 p-1 shadow-lg ${hasPreview ? 'border-cyan-500/60 bg-cyan-500/10 shadow-cyan-500/20' : 'border-white/20 bg-white/10'}`}
                    >
                      <img src={data?.imageUrl || '/logo.webp'} alt="Album Art" className="w-full h-full object-cover rounded-full" />
                    </motion.div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="text-white text-[13px] font-bold truncate tracking-tight mb-0.5">{data?.title || 'Unknown Title'}</h4>
                    <p className="text-cyan-400 font-black text-[9px] truncate uppercase tracking-[0.25em]">{data?.artist || 'Unknown Artist'}</p>
                    
                    <div className="mt-2.5 flex items-center gap-3">
                      <button 
                        onClick={togglePlay}
                        disabled={!hasPreview}
                        className={`w-8 h-8 flex items-center justify-center rounded-full text-black transition-all z-30 outline-none ${hasPreview ? 'bg-cyan-500 hover:scale-110 active:scale-90 shadow-md shadow-cyan-500/20' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}
                      >
                        {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                      </button>
                      
                      <div className="flex-1 space-y-2">
                        <div className="flex items-end gap-1 h-3 px-1">
                          {[...Array(10)].map((_, i) => (
                            <motion.div
                              key={i}
                              animate={{ 
                                height: isPlaying 
                                  ? [4, 10, 6, 12, 4] // Calmer heights
                                  : [4, 8, 4], // Faster breathing effect when paused
                                opacity: isPlaying 
                                  ? [0.5, 1, 0.7, 1, 0.5] 
                                  : [0.4, 0.7, 0.4] 
                              }}
                              transition={{ 
                                duration: isPlaying 
                                  ? 1.2 + (i * 0.2) // Much slower and calmer
                                  : 1.8 + (i * 0.2), // Faster breathing when paused
                                repeat: Infinity, 
                                ease: "easeInOut",
                                delay: i * 0.1 
                              }}
                              className={`w-1 rounded-full ${hasPreview ? 'bg-cyan-400' : 'bg-white/40'}`}
                            />
                          ))}
                        </div>
                        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]" 
                            style={{ width: `${progress}%` }} 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <audio ref={audioRef} src={data.previewUrl} onTimeUpdate={handleTimeUpdate} onEnded={() => setIsPlaying(false)} />
                
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/10 pl-1 pr-2">
                  <div className="flex items-center gap-2">
                    <Music2 size={10} className={`${hasPreview ? 'text-purple-400 drop-shadow-[0_0_5px_rgba(168,85,247,0.5)] animate-pulse' : 'text-white/20'}`} />
                    <span className="text-[8px] uppercase tracking-[0.4em] text-white/40 font-black">{hasPreview ? 'Spotify Music Preview' : 'Preview Unavailable'}</span>
                  </div>
                  {hasPreview && (
                    <span className="text-[7px] text-cyan-400 font-black tracking-widest uppercase border border-cyan-500/30 px-1.5 py-0.5 rounded bg-cyan-500/10 shadow-[0_0_10px_rgba(6,182,212,0.2)]">Space</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(playerContent, document.body);
};

export default MusicPlayerCard;