import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Activity, Monitor } from 'lucide-react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import LogLine from './LogLine.jsx';

const TerminalView = ({ 
  isVisible,
  progress,
  statusText,
  displayLogs,
  showSuccess,
  getTimestamp,
  scrollRef,
  handleScroll,
  error,
  isPickerOpen
}) => {
  const terminalContent = (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ 
            opacity: 1, 
            x: isPickerOpen ? 'calc(25vw - 140px - 50%)' : 0,
            scale: isPickerOpen ? 0.85 : 1,
            originX: 0.5,
            originY: 0.5
          }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          style={{ left: isPickerOpen ? '0' : '2rem' }}
          className='hidden lg:flex fixed top-0 bottom-0 w-[calc(50vw-280px)] max-w-[420px] min-w-[320px] z-[2000000] flex-col justify-start pt-6 pointer-events-none'
        >
          <div className='h-[88vh] relative bg-black/20 backdrop-blur-3xl border border-cyan-500/30 rounded-[2rem] shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden flex flex-col pointer-events-auto'>
            
            <div className='absolute inset-0 pointer-events-none z-50 opacity-[0.02] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,2px_100%]' />

            <div className='flex items-center gap-3 px-5 py-3 border-b border-cyan-500/20 bg-white/5 shrink-0'>
              <div className='flex gap-1.5'>
                <div className='w-2.5 h-2.5 rounded-full bg-red-500/30 border border-red-500/20' />
                <div className='w-2.5 h-2.5 rounded-full bg-yellow-500/30 border border-yellow-500/20' />
                <div className='w-2.5 h-2.5 rounded-full bg-green-500/30 border border-green-500/20' />
              </div>
              <div className='flex-1 flex items-center justify-center gap-2'>
                <Monitor size={12} className='text-cyan-400/40' />
                <span className='text-[10px] text-cyan-400/50 font-mono uppercase tracking-[0.2em] font-bold'>Terminal — root@nexstream</span>
              </div>
              <div className='w-12' />
            </div>

            <div className='flex-1 p-8 flex flex-col overflow-hidden relative'>
              <div className='relative z-20 mb-8 shrink-0'>
                <div className='flex items-center justify-between mb-4'>
                  <div className='flex items-center gap-3'>
                    <Terminal size={18} className='text-cyan-400' />
                    <span className='text-[11px] text-cyan-400 font-black uppercase tracking-[0.3em]'>SYSTEM_MONITOR</span>
                  </div>
                  <div className='flex items-baseline gap-1'>
                    <span className='text-xl font-mono font-bold text-cyan-400'>{Math.floor(progress)}</span>
                    <span className='text-[10px] text-cyan-500/50 font-mono'>%</span>
                  </div>
                </div>
                <div className='h-1.5 w-full bg-cyan-500/10 rounded-full overflow-hidden p-[0.5px] border border-cyan-500/10'>
                  <motion.div 
                    className='h-full bg-cyan-500 shadow-[0_0_15px_#22d3ee] rounded-full'
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ 
                      type: 'spring',
                      stiffness: 40,
                      damping: 15,
                      mass: 0.5
                    }}
                  />
                </div>
              </div>

              <div className='mb-8 shrink-0'>
                <div className='text-[9px] text-cyan-400/30 uppercase tracking-[0.5em] font-black mb-2'>CURRENT_OPERATION</div>
                <div className={`inline-block px-4 py-1.5 rounded-lg bg-cyan-500/5 border ${error ? 'border-red-500/40 text-red-400' : 'border-cyan-500/10 text-white/90'} text-[11px] font-mono tracking-widest uppercase`}>
                  {statusText}
                </div>
              </div>

              <div className='flex-1 min-h-0 flex flex-col relative'>
                <div className='flex items-center gap-3 mb-5 border-b border-cyan-500/10 pb-3 shrink-0 relative z-20'>
                  <Activity size={14} className='text-cyan-500/60' />
                  <span className='text-[10px] text-cyan-400/40 uppercase tracking-[0.3em] font-black'>TECHNICAL_STREAM</span>
                </div>
                
                <div 
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4 font-mono scroll-smooth relative z-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-cyan-500/20 hover:scrollbar-thumb-cyan-500/40"
                >
                  <AnimatePresence mode='popLayout'>
                    {showSuccess ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className='flex flex-col gap-4'>
                        <LogLine log={{ timestamp: getTimestamp(), text: 'Successfully Sent to Device', type: 'success' }} isTyping={false} />
                        <LogLine log={{ timestamp: getTimestamp(), text: 'Successfully processed. Check your downloads to find your file.', type: 'info' }} isTyping={true} />
                      </motion.div>
                    ) : (
                      displayLogs.map((log, index) => (
                        <LogLine 
                          key={log.id} 
                          log={log} 
                          isLast={index === displayLogs.length - 1} 
                        />
                      ))
                    )}
                  </AnimatePresence>
                  {!showSuccess && displayLogs.length === 0 && (
                    <div className='text-[11px] text-cyan-500/10 animate-pulse tracking-widest font-black uppercase'>
                      WAITING_FOR_UPLINK...
                    </div>
                  )}
                </div>
              </div>

              <div className='mt-8 pt-5 border-t border-cyan-500/10 shrink-0'>
                <div className='flex justify-between items-center opacity-40'>
                  <div className='text-[9px] text-cyan-400 font-black uppercase tracking-[0.3em] italic'>NEXSTREAM_V1</div>
                  <div className='flex gap-2'>
                     {[...Array(3)].map((_, i) => (
                       <motion.div 
                          key={i} 
                          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                          className='w-1 h-1 bg-cyan-500 rounded-full shadow-[0_0_5px_#22d3ee]' 
                       />
                   ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(terminalContent, document.body);
};

TerminalView.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  progress: PropTypes.number.isRequired,
  statusText: PropTypes.string,
  displayLogs: PropTypes.arrayOf(PropTypes.object).isRequired,
  showSuccess: PropTypes.bool,
  getTimestamp: PropTypes.func.isRequired,
  scrollRef: PropTypes.oneOfType([
    PropTypes.func, 
    PropTypes.shape({ current: PropTypes.any })
  ]),
  handleScroll: PropTypes.func,
  error: PropTypes.string,
  isPickerOpen: PropTypes.bool
};

export default TerminalView;
