import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, FileVideo } from 'lucide-react';

const MobileProgress = ({ 
  loading, 
  progress, 
  status, 
  subStatus, 
  videoTitle, 
  selectedFormat 
}) => {
  const getStatusText = () => {
    const formatName = selectedFormat === 'mp4' ? 'video' : 'audio';
    switch (status) {
      case 'fetching_info':
        return progress > 0
          ? `Analyzing ${formatName} (${Math.floor(progress)}%)`
          : `Analyzing ${formatName}...`;
      case 'downloading':
        return 'Starting Download...';
      case 'merging':
        return 'Finalizing file (almost done)...';
      case 'sending':
        return 'Sending to device...';
      case 'completed':
        return 'Complete!';
      case 'initializing':
        return progress > 0
          ? `Preparing (${Math.floor(progress)}%)`
          : 'Initializing...';
      default:
        return 'Processing...';
    }
  };

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className='md:hidden w-full max-w-md mt-4 bg-black/20 rounded-2xl p-4 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
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
              {subStatus.startsWith('STREAM ESTABLISHED') ? (
                <motion.div
                  key='receiving-data'
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className='flex items-center w-full'
                >
                  <span className='shrink-0'>STATUS:&nbsp;</span>
                  <span className='text-cyan-400 font-bold'>{subStatus}</span>
                </motion.div>
              ) : (
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
              )}
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
              <span className='text-xs truncate font-medium'>
                {videoTitle}
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileProgress;