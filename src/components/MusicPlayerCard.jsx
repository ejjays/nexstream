import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Music2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

const MusicPlayerCard = ({ isVisible, data, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!isVisible) {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [isVisible]);

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

  if (!data?.previewUrl) return null;

  const playerContent = (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          className="fixed bottom-4 right-4 left-4 md:left-auto md:bottom-8 md:right-8 z-[200000] hidden md:block"
        >
          <div className="relative group mx-auto md:mx-0 w-full max-w-[340px] md:w-80">
            {/* Cyberpunk Glow Background */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
            
            <div className="relative w-full bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl overflow-hidden">
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
                    className="w-16 h-16 rounded-full overflow-hidden border-2 border-cyan-500/50 p-1"
                  >
                    <img 
                      src={data.imageUrl} 
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
                    {data.title}
                  </h4>
                  <p className="text-cyan-400/80 text-xs truncate">
                    {data.artist}
                  </p>
                  
                  <div className="mt-3 flex items-center gap-3">
                    <button 
                      onClick={togglePlay}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-cyan-500 text-black hover:scale-110 active:scale-95 transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)]"
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
                            className="w-1 bg-cyan-500/40 rounded-full"
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

              <audio 
                ref={audioRef}
                src={data.previewUrl}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
              />
              
              <div className="mt-2 flex items-center gap-2">
                <Music2 size={10} className="text-purple-400 animate-pulse" />
                <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-bold">
                  Previewing Spotify Content
                </span>
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