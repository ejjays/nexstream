import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Activity, Monitor } from 'lucide-react';

const TypingText = ({ text, delay = 0, showCursor = false }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), delay * 1000);
    return () => clearTimeout(startTimer);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    
    if (displayedText.length < text.length) {
      const nextCharTimer = setTimeout(() => {
        setDisplayedText(text.slice(0, displayedText.length + 1));
      }, 40);
      return () => clearTimeout(nextCharTimer);
    }
  }, [displayedText, text, started]);

  return (
    <span>
      {displayedText}
      {showCursor && (
        <motion.span 
          animate={{ opacity: [1, 0] }}
          transition={{ repeat: Infinity, duration: 0.8 }}
          className='inline-block w-1.5 h-3 bg-cyan-400/60 ml-0.5 translate-y-0.5'
        />
      )}
    </span>
  );
};

const DesktopProgress = ({ 
  loading, 
  progress, 
  status, 
  desktopLogs = [], 
  selectedFormat,
  error,
  isPickerOpen
}) => {
  const [displayLogs, setDisplayLogs] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const queueRef = useRef([]);
  const isProcessingRef = useRef(false);
  const lastPrintedLogRef = useRef('');
  const processedCountRef = useRef(0);
  const startTimeRef = useRef(null);
  const scrollRef = useRef(null);
  const isAutoScrollPinnedRef = useRef(true);

  const humanize = (text) => {
    if (!text) return '';
    if (text.includes('ISRC_IDENTIFIED:')) {
      const isrc = text.split('ISRC_IDENTIFIED:')[1].trim();
      return `FINGERPRINT: ${isrc}`;
    }

    let cleaned = text
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .trim();

    cleaned = cleaned
      .replace(/\bApi\b/g, 'API')
      .replace(/\bIsrc\b/g, 'ISRC')
      .replace(/\bTls\b/g, 'TLS')
      .replace(/\bSse\b/g, 'SSE')
      .replace(/\bYoutube\b/g, 'YouTube')
      .replace(/\bSpotify\b/g, 'Spotify')
      .replace(/\bId\b/g, 'ID')
      .replace(/\bAi\b/g, 'AI')
      .replace(/\bCdn\b/g, 'CDN')
      .replace(/\bDns\b/g, 'DNS')
      .replace(/\bMuxer\b/g, 'MUXER')
      .replace(/\bHttp\b/g, 'HTTP');

    return cleaned;
  };

  const formatLogForDisplay = (text) => {
    if (!text) return '';
    if (text.toUpperCase().includes('ISRC_IDENTIFIED:')) {
      const isrc = text.split(/:/)[1].trim();
      return `FINGERPRINT: ${isrc}`;
    }
    const withoutPrefix = text.replace(/^[A-Za-z0-9_\-\s]+:\s*/, '');
    return humanize(withoutPrefix);
  };

  const getTimestamp = () => {
    if (!startTimeRef.current) return '[0:00]';
    const elapsedMs = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const mins = Math.floor(elapsedMs / 60);
    const secs = elapsedMs % 60;
    return `[${mins}:${secs.toString().padStart(2, '0')}]`;
  };

  // Monitor incoming logs
  useEffect(() => {
    // Process logs if we are loading, picking quality, or in an active state
    const isActivelyProcessing = loading || isPickerOpen || 
      ['fetching_info', 'initializing', 'downloading', 'merging', 'sending'].includes(status);

    if (isActivelyProcessing) {
      if (showSuccess) setShowSuccess(false);
      if (!startTimeRef.current) startTimeRef.current = Date.now();

      // Detect transition to Phase 2 (desktopLogs reset by parent)
      if (desktopLogs.length === 0 && processedCountRef.current > 0) {
        // DO NOT clear queueRef - let existing logs finish typing
        processedCountRef.current = 0;
        lastPrintedLogRef.current = '';
        return; 
      }

      if (desktopLogs.length > processedCountRef.current) {
        const newRawLogs = desktopLogs.slice(processedCountRef.current);
        queueRef.current = [...queueRef.current, ...newRawLogs];
        processedCountRef.current = desktopLogs.length;
        if (!isProcessingRef.current) processNext();
      }
    } else if (status === 'completed') {
      if (!showSuccess) {
        setShowSuccess(true);
        setDisplayLogs([]); // Clear for final success screen only
        queueRef.current = [];
        isProcessingRef.current = false;
      }
    } else if (error) {
      if (showSuccess) setShowSuccess(false);
      const errorMsg = `SYSTEM_ALERT: ${error.toUpperCase()}`;
      if (lastPrintedLogRef.current !== errorMsg) {
        queueRef.current.push(errorMsg);
        if (!isProcessingRef.current) processNext();
      }
    } else if (!loading && !status && !error && !isPickerOpen) {
      setDisplayLogs([]);
      queueRef.current = [];
      isProcessingRef.current = false;
      lastPrintedLogRef.current = '';
      processedCountRef.current = 0;
      startTimeRef.current = null;
      isAutoScrollPinnedRef.current = true;
      setShowSuccess(false);
    }
  }, [desktopLogs, loading, status, error, isPickerOpen]);

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
        timestamp: getTimestamp(),
        type: rawLog.includes('SYSTEM_ALERT') ? 'error' : 'info'
      }].slice(-100));

      // Slightly faster processing for better terminal feel (450ms instead of 600ms)
      setTimeout(processNext, 450);
    } else {
      processNext();
    }
  };

  useEffect(() => {
    if (scrollRef.current && isAutoScrollPinnedRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayLogs, showSuccess]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;
      isAutoScrollPinnedRef.current = isAtBottom;
    }
  };

  const getStatusText = () => {
    if (error) return 'SYSTEM_FAILURE';
    if (status === 'completed') return 'TASK_COMPLETED';
    if (isPickerOpen) return 'AWAITING_SELECTION';
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

  const isVisible = loading || status === 'completed' || error || isPickerOpen;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          className='hidden lg:flex fixed left-8 top-0 bottom-0 w-[calc(50vw-280px)] max-w-[420px] min-w-[320px] z-50 flex-col justify-center'
        >
          <div className='h-[80vh] relative bg-black/20 backdrop-blur-3xl border border-cyan-500/30 rounded-[2rem] shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden flex flex-col'>
            
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
                      stiffness: progress === 100 ? 120 : 60, 
                      damping: 15,
                      mass: 0.8
                    }}
                  />
                </div>
              </div>

              <div className='mb-8 shrink-0'>
                <div className='text-[9px] text-cyan-400/30 uppercase tracking-[0.5em] font-black mb-2'>CURRENT_OPERATION</div>
                <div className={`inline-block px-4 py-1.5 rounded-lg bg-cyan-500/5 border ${error ? 'border-red-500/40 text-red-400' : 'border-cyan-500/10 text-white/90'} text-[11px] font-mono tracking-widest uppercase`}>
                  {getStatusText()}
                </div>
              </div>

              <div className='flex-1 min-h-0 flex flex-col relative'>
                <div className='flex items-center gap-3 mb-5 border-b border-cyan-500/10 pb-3 shrink-0 relative z-20'>
                  <Activity size={14} className='text-cyan-500/60' />
                  <span className='text-[10px] text-cyan-400/40 uppercase tracking-[0.3em] font-black'>TECHNICAL_STREAM</span>
                </div>
                
                <div className='absolute inset-0 pointer-events-none z-10 overflow-hidden mt-8'>
                  <motion.div 
                    className='absolute inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent will-change-transform'
                    style={{ width: '100%' }}
                    animate={{ y: ['0vh', '45vh'], opacity: [0, 1, 1, 0] }}
                    transition={{ 
                      duration: 6, 
                      repeat: Infinity, 
                      ease: "linear",
                      times: [0, 0.1, 0.9, 1] 
                    }}
                  />
                </div>

                <div 
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4 font-mono scroll-smooth relative z-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-cyan-500/20 hover:scrollbar-thumb-cyan-500/40 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-cyan-500/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-cyan-500/40"
                >
                  <AnimatePresence mode='popLayout'>
                    {showSuccess ? (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5 }}
                        className='flex flex-col gap-4'
                      >
                        <div className='flex items-start gap-3 text-[11px] leading-relaxed'>
                           <span className='text-cyan-500/30 shrink-0 font-bold tabular-nums w-12 text-right'>
                             {getTimestamp()}
                           </span>
                           <span className='text-emerald-400 font-black shrink-0 opacity-80 w-3 text-center'>{'>'}</span>
                           <span className='text-emerald-400/90 break-words tracking-tight flex-1 font-medium'>
                             Successfully Sent to Device
                           </span>
                        </div>
                        <div className='flex items-start gap-3 text-[11px] leading-relaxed'>
                           <span className='text-cyan-500/30 shrink-0 font-bold tabular-nums w-12 text-right'>
                             {getTimestamp()}
                           </span>
                           <span className='text-cyan-600 font-black shrink-0 opacity-80 w-3 text-center'>{'>'}</span>
                           <span className='text-cyan-300/80 break-words tracking-tight flex-1'>
                             <TypingText text="Successfully processed. Check your downloads to find your file." delay={0.6} showCursor={true} />
                           </span>
                        </div>
                      </motion.div>
                    ) : (
                      displayLogs.map((log, index) => (
                        <motion.div
                          key={log.id}
                          initial={{ opacity: 0, x: -5 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className='flex items-start gap-3 text-[11px] leading-relaxed group/item relative'
                        >
                          <span className='text-cyan-500/30 shrink-0 font-bold tabular-nums w-12 text-right'>
                            {log.timestamp}
                          </span>
                          
                          <span className={`shrink-0 opacity-50 group-hover/item:opacity-100 transition-opacity w-3 text-center font-black ${log.type === 'error' ? 'text-red-500' : 'text-cyan-600'}`}>
                            {log.type === 'error' ? '!' : '>'}
                          </span>

                          <span className={`break-words tracking-tight flex-1 relative ${log.type === 'error' ? 'text-red-400' : 'text-cyan-300/80'}`}>
                            {log.text}
                            {index === displayLogs.length - 1 && (
                              <motion.span 
                                animate={{ opacity: [1, 0] }}
                                transition={{ repeat: Infinity, duration: 0.8 }}
                                className='inline-block w-1.5 h-3 bg-cyan-400/60 ml-1 translate-y-0.5'
                              />
                            )}
                          </span>
                        </motion.div>
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
};

export default DesktopProgress;
