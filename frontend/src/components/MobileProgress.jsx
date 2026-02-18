import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, FileVideo, CheckCircle2, AlertCircle } from 'lucide-react';

const MobileStatusCard = ({ 
  loading, 
  progress, 
  status, 
  subStatus, 
  videoTitle, 
  selectedFormat,
  error 
}) => {
  const getStatusText = () => {
    const formatName = selectedFormat === 'mp4' ? 'video' : 'audio';
    switch (status) {
      case 'fetching_info':
        return progress > 0
          ? `Analyzing ${formatName} (${Math.floor(progress)}%)`
          : `Analyzing ${formatName}...`;
      case 'downloading': return 'Starting Download...';
      case 'merging': return 'Finalizing file (almost done)...';
      case 'sending': return 'Sending to device...';
      case 'completed': return 'Complete!';
      case 'initializing':
        return progress > 0
          ? `Preparing (${Math.floor(progress)}%)`
          : 'Initializing...';
      default: return 'Processing...';
    }
  };

  const isVisible = loading || status === 'completed' || error;

  return (
    <div className='lg:hidden w-full max-w-md mt-8 flex items-center justify-center'>
      <AnimatePresence mode="wait">
        {isVisible ? (
          <motion.div
            key="active-status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='w-full relative group'
          >
            <AnimatePresence mode="wait">
              {error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className='relative flex items-center gap-4 bg-black/40 backdrop-blur-xl border border-red-500/30 p-4 rounded-2xl shadow-2xl overflow-hidden'
                >
                  <div className='absolute -inset-0.5 bg-gradient-to-r from-red-500 to-rose-600 rounded-2xl blur opacity-20 pointer-events-none'></div>
                  <div className='relative shrink-0'>
                    <div className='absolute inset-0 bg-red-500 blur-lg opacity-40 animate-pulse'></div>
                    <div className='relative bg-red-500/20 p-2.5 rounded-xl border border-red-500/50'>
                      <AlertCircle size={22} className='text-red-400' />
                    </div>
                  </div>
                  <div className='flex-1 min-w-0'>
                    <h4 className='text-red-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1'>System Alert</h4>
                    <p className='text-gray-200 text-xs font-medium leading-relaxed break-words'>{error}</p>
                  </div>
                </motion.div>
              ) : status === 'completed' && !loading ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className='relative flex items-center gap-4 bg-black/40 backdrop-blur-xl border border-emerald-500/30 p-4 rounded-2xl shadow-2xl overflow-hidden'
                >
                  <div className='absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-600 rounded-2xl blur opacity-20 pointer-events-none'></div>
                  <div className='relative shrink-0'>
                    <div className='absolute inset-0 bg-emerald-500 blur-lg opacity-40 animate-pulse'></div>
                    <div className='relative bg-emerald-500/20 p-2.5 rounded-xl border border-emerald-500/50'>
                      <CheckCircle2 size={22} className='text-emerald-400' />
                    </div>
                  </div>
                  <div className='flex-1 min-w-0'>
                    <h4 className='text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1'>Download started</h4>
                    <p className='text-gray-200 text-xs font-medium leading-relaxed'>Successfully sent to your device.</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className='bg-black/20 rounded-2xl p-4 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.15)] backdrop-blur-xl'
                >
                  <div className='flex justify-between mb-1 text-xs text-cyan-400 font-bold tracking-tight'>
                    <span className='flex items-center gap-2'>
                      <Loader2 className='w-3 h-3 animate-spin' />
                      {getStatusText()}
                    </span>
                    <span className='font-mono'>{Math.floor(progress)}%</span>
                  </div>

                  <div className='text-[10px] text-cyan-300/60 font-mono mb-2 truncate uppercase tracking-widest pl-1 h-4 flex items-center overflow-hidden'>
                    <AnimatePresence mode='wait'>
                      <motion.div
                        key={subStatus}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.3 }}
                        className='animate-pulse-slow'
                      >
                        {subStatus || 'Synchronizing...'}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  <div className='w-full h-2 bg-white/5 rounded-full overflow-hidden relative border border-white/5'>
                    <motion.div
                      className='h-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-blue-500 rounded-full relative'
                      style={{ width: `${progress}%` }}
                    >
                      <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_1.5s_infinite]'></div>
                    </motion.div>
                  </div>

                  {videoTitle && (
                    <div className='mt-3 flex items-center gap-2 pt-3 border-t border-white/10 text-white'>
                      <FileVideo size={16} className='text-cyan-500 shrink-0' />
                      <span className='text-xs truncate font-medium'>{videoTitle}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default MobileStatusCard;