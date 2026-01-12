import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Download, Music, Video, Monitor } from 'lucide-react';
import { createPortal } from 'react-dom';

const QualityPicker = ({ isOpen, onClose, selectedFormat = 'mp4', videoData, onSelect }) => {
  if (!videoData) return null;

  const options = selectedFormat === 'mp4' ? videoData.formats : videoData.audioFormats;

  const formatSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[999] flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
        >
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-[2px]"
            style={{ zIndex: -1, willChange: 'opacity' }}
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="relative w-full max-w-lg bg-gray-900 border border-cyan-500/30 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col max-h-[90vh]"
            style={{ willChange: 'transform, opacity' }}
          >
            {/* Header / Close Button */}
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 z-10 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/70 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            {/* Thumbnail Section */}
            <div className="relative w-full aspect-video overflow-hidden group">
              <img 
                src={videoData.thumbnail} 
                alt="Thumbnail" 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-cyan-500/20 backdrop-blur-md rounded-full flex items-center justify-center border border-cyan-500/30">
                  <Play className="text-cyan-400 fill-cyan-400 ml-1" size={32} />
                </div>
              </div>
            </div>

            {/* Info & List Section */}
            <div className="p-6 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
              <div>
                <h3 className="text-white font-bold text-lg leading-tight line-clamp-2">
                  {videoData.title}
                </h3>
                <p className="text-gray-400 text-xs mt-1 flex items-center gap-1">
                  {selectedFormat === 'mp4' ? <Video size={12} /> : <Music size={12} />}
                  Format: {selectedFormat.toUpperCase()}
                </p>
              </div>

              <div className="space-y-2 mt-2">
                <p className="text-cyan-400 text-[10px] font-bold uppercase tracking-wider">Available Quality</p>
                {options.length > 0 ? (
                  options.map((option, idx) => (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onSelect(option.format_id)}
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-cyan-500 group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                          {selectedFormat === 'mp4' ? <Monitor size={20} /> : <Music size={20} />}
                        </div>
                        <div className="text-left">
                          <div className="text-white font-semibold text-sm">
                            {option.quality} {option.fps && <span className="text-[10px] text-gray-500 ml-1">{option.fps}fps</span>}
                          </div>
                          <div className="text-gray-500 text-[10px]">{formatSize(option.filesize)}</div>
                        </div>
                      </div>
                      <Download className="text-gray-600 group-hover:text-cyan-400 transition-colors" size={18} />
                    </motion.button>
                  ))
                ) : (
                  <div className="text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10">
                    <p className="text-gray-500 text-sm italic">No formats found for this link.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-center">
               <p className="text-[10px] text-gray-500">Choose your preferred quality to start the process</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default QualityPicker;

