import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Activity } from 'lucide-react';

const DesktopProgress = ({ 
  loading, 
  progress, 
  status, 
  desktopLogs = [], 
  selectedFormat 
}) => {
  const [displayLogs, setDisplayLogs] = useState([]);
  
  const queueRef = useRef([]);
  const isProcessingRef = useRef(false);
  const lastPrintedLogRef = useRef('');
  const processedCountRef = useRef(0);
  const startTimeRef = useRef(null);
  const scrollRef = useRef(null);

  // Helper to convert technical slugs to readable, sophisticated technical text
  const humanize = (text) => {
    if (!text) return '';
    
    // Handle ISRC specifically as requested
    if (text.includes('ISRC_IDENTIFIED:')) {
      const isrc = text.split('ISRC_IDENTIFIED:')[1].trim();
      return `FINGERPRINT: ${isrc}`;
    }

    // Clean up underscores and capitalization
    let cleaned = text
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase()) // Title Case
      .trim();

    // Fix Acronyms and Technical terms
    cleaned = cleaned
      .replace(/\bApi\b/g, 'API')
      .replace(/\bIsrc\b/g, 'ISRC')
      .replace(/\bTls\b/g, 'TLS')
      .replace(/\bSse\b/g, 'SSE')
      .replace(/\bYoutube\b/g, 'YouTube')
      .replace(/\bSpotify\b/g, 'Spotify')
      .replace(/\bId\b/g, 'ID')
      .replace(/\bAi\b/g, 'AI');

    return cleaned;
  };

  const formatLogForDisplay = (text) => {
    if (!text) return '';
    
    // Handle ISRC with the specific "FINGERPRINT" format before general cleaning
    if (text.toUpperCase().includes('ISRC_IDENTIFIED:')) {
      const isrc = text.split(/:/)[1].trim();
      return `FINGERPRINT: ${isrc}`;
    }

    // 1. Remove the prefix tag (e.g. "STRATEGY_AI: ")
    const withoutPrefix = text.replace(/^[A-Za-z0-9_\-\s]+:\s*/, '');
    
    // 2. Humanize the remaining text with technical corrections
    return humanize(withoutPrefix);
  };

  const getTimestamp = () => {
    if (!startTimeRef.current) return '[0:00]';
    const elapsedMs = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const mins = Math.floor(elapsedMs / 60);
    const secs = elapsedMs % 60;
    return `[${mins}:${secs.toString().padStart(2, '0')}]`;
  };

  useEffect(() => {
    if (loading) {
      if (!startTimeRef.current) startTimeRef.current = Date.now();

      if (desktopLogs.length > processedCountRef.current) {
        const newRawLogs = desktopLogs.slice(processedCountRef.current);
        queueRef.current = [...queueRef.current, ...newRawLogs];
        processedCountRef.current = desktopLogs.length;
        
        if (!isProcessingRef.current) {
          processNext();
        }
      }
    } else if (status !== 'completed') {
      setDisplayLogs([]);
      queueRef.current = [];
      isProcessingRef.current = false;
      lastPrintedLogRef.current = '';
      processedCountRef.current = 0;
      startTimeRef.current = null;
    }
  }, [desktopLogs, loading, status]);

  const processNext = () => {
    if (queueRef.current.length === 0) {
      isProcessingRef.current = false;
      return;
    }

    isProcessingRef.current = true;
    const rawLog = queueRef.current.shift();
    const formatted = formatLogForDisplay(rawLog);

    if (formatted && formatted !== lastPrintedLogRef.current) {
      lastPrintedLogRef.current = formatted;
      
      setDisplayLogs(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        text: formatted,
        timestamp: getTimestamp()
      }].slice(-40));

      setTimeout(processNext, 600);
    } else {
      processNext();
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayLogs]);

  const getStatusText = () => {
    const formatName = selectedFormat === 'mp4' ? 'VIDEO' : 'AUDIO';
    switch (status) {
      case 'fetching_info': return `ANALYZING_${formatName}`;
      case 'downloading': return 'EXTRACTING_STREAM';
      case 'merging': return 'COMPILING_ASSETS';
      case 'sending': return 'BUFFERING_TO_CLIENT';
      case 'completed': return 'HANDSHAKE_COMPLETE';
      case 'initializing': return 'BOOTING_CORE';
      default: return 'SYSTEM_IDLE';
    }
  };

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          className='hidden lg:flex fixed left-8 top-1/2 -translate-y-1/2 w-[calc(50vw-280px)] max-w-[420px] min-w-[320px] h-[75vh] z-50 flex-col'
        >
          <div className='flex-1 relative bg-cyan-950/10 backdrop-blur-3xl border border-cyan-500/20 rounded-[2.5rem] p-8 shadow-[0_0_60px_rgba(6,182,212,0.15)] overflow-hidden flex flex-col'>
            
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
              
              <div className='h-1.5 w-full bg-cyan-500/10 rounded-full overflow-hidden p-[1px] border border-cyan-500/5'>
                <motion.div 
                  className='h-full bg-cyan-500 shadow-[0_0_15px_#22d3ee] rounded-full'
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: 'spring', stiffness: 40, damping: 20 }}
                />
              </div>
            </div>

            <div className='mb-8 shrink-0'>
              <div className='text-[9px] text-cyan-400/30 uppercase tracking-[0.5em] font-black mb-2'>CURRENT_OPERATION</div>
              <div className='inline-block px-4 py-1.5 rounded-lg bg-cyan-500/5 border border-cyan-500/10 text-[11px] text-white/90 font-mono tracking-widest'>
                {getStatusText()}
              </div>
            </div>

            <div className='flex-1 min-h-0 flex flex-col'>
              <div className='flex items-center gap-3 mb-5 border-b border-cyan-500/10 pb-3 shrink-0'>
                <Activity size={14} className='text-cyan-500/60' />
                <span className='text-[10px] text-cyan-400/40 uppercase tracking-[0.3em] font-black'>TECHNICAL_STREAM</span>
              </div>
              
              <div 
                ref={scrollRef}
                className='flex-1 overflow-y-auto pr-3 scrollbar-none flex flex-col gap-4 font-mono scroll-smooth'
              >
                <AnimatePresence mode='popLayout'>
                  {displayLogs.map((log) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -15, y: 5 }}
                      animate={{ opacity: 1, x: 0, y: 0 }}
                      className='flex items-start gap-2 text-[11px] leading-relaxed group'
                    >
                      <span className='text-cyan-500/30 shrink-0 font-bold tabular-nums w-12 text-right'>
                        {log.timestamp}
                      </span>
                      
                      <span className='text-cyan-600 font-black shrink-0 opacity-50 group-hover:opacity-100 transition-opacity w-3 text-center'>
                        {'>'}
                      </span>

                      <span className='text-cyan-300/80 break-words tracking-tight flex-1'>
                        {log.text}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {displayLogs.length === 0 && (
                  <div className='text-[11px] text-cyan-500/10 animate-pulse tracking-widest font-black uppercase'>
                    WAITING_FOR_UPLINK...
                  </div>
                )}
              </div>
            </div>

            <div className='mt-8 pt-5 border-t border-cyan-500/10 shrink-0'>
              <div className='flex justify-between items-center opacity-40'>
                <div className='text-[9px] text-cyan-400 font-black uppercase tracking-[0.3em] italic'>NEXUS_SYNC</div>
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DesktopProgress;