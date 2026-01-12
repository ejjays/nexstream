import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Download, Music, Video, Monitor, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import FormatIcon from "../../assets/icons/FormatIcon.jsx";

const QualityPicker = ({
  isOpen,
  onClose,
  selectedFormat = "mp4",
  videoData,
  onSelect
}) => {
  if (!videoData) return null;

  const options =
    selectedFormat === "mp4" ? videoData.formats : videoData.audioFormats;

  const [selectedQualityId, setSelectedQualityId] = useState("");

  useEffect(() => {
    if (options && options.length > 0) {
      // Default to the first one (best quality because backend sorts DESC by height)
      setSelectedQualityId(options[0].format_id);
    }
  }, [options, isOpen]);

  const formatSize = bytes => {
    if (!bytes) return "Unknown size";
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
            style={{ zIndex: -1, willChange: "opacity" }}
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="relative w-full max-w-lg bg-gray-900 border border-cyan-500/30 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col max-h-[90vh]"
            style={{ willChange: "transform, opacity" }}
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
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 rounded-2xl"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-cyan-500/20 backdrop-blur-md rounded-full flex items-center justify-center border border-cyan-500/30">
                  <Play
                    className="text-cyan-400 fill-cyan-400 ml-1"
                    size={32}
                  />
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
                  {selectedFormat === "mp4" ? (
                    <FormatIcon size={15} />
                  ) : (
                    <Music size={12} />
                  )}
                  Format: {selectedFormat.toUpperCase()}
                </p>
              </div>

              <div className="space-y-2 mt-2">
                <p className="text-cyan-400 text-[10px] font-bold uppercase tracking-wider">
                  Select Quality
                </p>
                {options.length > 0 ? (
                  <div className="flex gap-2">
                    <div className="relative flex-1 group">
                      <select
                        value={selectedQualityId}
                        onChange={(e) => setSelectedQualityId(e.target.value)}
                        className="w-full h-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-4 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500/50 hover:bg-white/10 transition-all text-sm font-medium"
                      >
                        {options.map((option, idx) => (
                          <option 
                            key={idx} 
                            value={option.format_id} 
                            className="bg-gray-900 text-white"
                          >
                            {option.quality} {option.fps ? `(${option.fps}fps)` : ''} — {formatSize(option.filesize)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown 
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-cyan-400 transition-colors pointer-events-none" 
                        size={18} 
                      />
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onSelect(selectedQualityId)}
                      className="bg-cyan-500 hover:bg-cyan-400 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold transition-all shadow-lg shadow-cyan-500/20 border border-cyan-400/30"
                    >
                      <Download size={20} />
                      <span className="hidden sm:inline">Download</span>
                    </motion.button>
                  </div>
                ) : (
                  <div className="text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10">
                    <p className="text-gray-500 text-sm italic">
                      No formats found for this link.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-center">
              <p className="text-[10px] text-gray-500">
                Choose your preferred quality to start the process
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
