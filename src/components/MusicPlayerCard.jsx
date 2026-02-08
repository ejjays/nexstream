import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Play, Pause, Music2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

const MusicPlayerCard = ({ isVisible, data, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);
  const controls = useAnimation();

  useEffect(() => {
    if (!isVisible) {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [isVisible]);

  const handleDragEnd = (event, info) => {
    const screenWidth = window.innerWidth;
    const cardWidth = 320; 
    const margin = 16; 
    
    // Calculate if closer to left or right edge
    const isLeft = info.point.x < screenWidth / 2;
    
    if (isLeft) {
      // Snap to left edge
      const targetX = -(screenWidth - cardWidth - margin * 2);
      controls.start({ 
        x: targetX,
        transition: { type: 'spring', stiffness: 300, damping: 30 }
      });
    } else {
      // Snap to right edge (original position)
      controls.start({ 
        x: 0,
        transition: { type: 'spring', stiffness: 300, damping: 30 }
      });
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    const duration = audioRef.current.duration;
    const currentTime = audioRef.current.currentTime;
    if (duration > 0) {
      setProgress((currentTime / duration) * 100);
    }
  };

  const hasPreview = !!data?.previewUrl;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <motion.div
          drag
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          animate={controls}
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          className="fixed bottom-4 right-4 z-[200000] cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="relative group w-80">
            {/* Cyberpunk Glow Background */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
            
            <div className="relative w-full bg-black/60 backdrop-blur-xl border border-white/10 p-4 pt-6 rounded-2xl shadow-2xl overflow-hidden">
              {/* Drag Handle Pill */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1 bg-white/20 rounded-full group-hover:bg-white/40 transition-colors" />

              <button 
                onClick={onClose}
                className="absolute top-2 right-2 p-1 rounded-lg hover:bg-white/10 text-gray-400 transition-colors"
              >
                <X size={14} />
              </button>

              <div className="flex items-center gap-4">
                {/* Album Art with Spinning Effect when Playing */}
                <div className="relative shrink-0">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ 
                      duration: isPlaying ? 10 : 60, 
                      repeat: Infinity, 
                      ease: "linear" 
                    }}
                    className={`w-16 h-16 rounded-full overflow-hidden border-2 p-1 ${hasPreview ? 'border-cyan-500/50' : 'border-gray-500/50'}`}
                  >
                    <img 
                      src={data?.imageUrl || '/pwa-icon.png'} 
                      alt="Album Art" 
                      className="w-full h-full object-cover rounded-full"
                    />
                  </motion.div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-3 h-3 bg-black rounded-full border border-white/20"></div>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-white text-sm font-bold truncate tracking-tight">
                    {data?.title || 'Unknown Title'}
                  </h4>
                  <p className="text-cyan-400/80 text-xs truncate">
                    {data?.artist || 'Unknown Artist'}
                  </p>
                  
                  <div className="mt-3 flex items-center gap-3">
                    <button 
                      onClick={hasPreview ? togglePlay : undefined}
                      disabled={!hasPreview}
                      className={`w-8 h-8 flex items-center justify-center rounded-full text-black transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] ${hasPreview ? 'bg-cyan-500 hover:scale-110 active:scale-95' : 'bg-gray-600 opacity-50 cursor-not-allowed'}`}
                    >
                      {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                    </button>
                    
                    {/* Visualizer-ish Progress Bar */}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-1 h-3">
                        {[...Array(12)].map((_, i) => (
                          <motion.div
                            key={i}
                            animate={isPlaying ? {
                              height: [4, Math.random() * 12 + 4, 4],
                            } : { height: 4 }}
                            transition={{
                              duration: 0.5,
                              repeat: Infinity,
                              delay: i * 0.05,
                            }}
                            className={`w-1 rounded-full ${hasPreview ? 'bg-cyan-500/40' : 'bg-gray-500/20'}`}
                          />
                        ))}
                      </div>
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-cyan-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {hasPreview && (
                <audio 
                  ref={audioRef}
                  src={data.previewUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                />
              )}
              
              <div className="mt-2 flex items-center gap-2">
                <Music2 size={10} className={`${hasPreview ? 'text-purple-400 animate-pulse' : 'text-gray-500'}`} />
                <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-bold">
                  {hasPreview ? 'Previewing Spotify Content' : 'Preview Unavailable'}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default MusicPlayerCard;
