import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import meowCool from '../assets/meow.png';
import {
  Link,
  Loader2,
  FileVideo,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import YouTubeIcon from '../assets/icons/YouTubeIcon.jsx';
import MusicIcon from '../assets/icons/MusicIcon.jsx';
import PasteIcon from '../assets/icons/PasteIcon.jsx';
import GlowButton from './ui/GlowButton.jsx';
import VideoIcon from '../assets/icons/VideoIcon.jsx';
import QualityPicker from './modals/QualityPicker.jsx';
import PurpleBackground from './ui/PurpleBackground.jsx';

const MainContent = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [subStatus, setSubStatus] = useState('');
  const [pendingSubStatuses, setPendingSubStatuses] = useState([]);
  const [videoTitle, setVideoTitle] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const titleRef = useRef('');

  // Sub-status Buffer Logic: Ensures technical messages are readable (Minimum 750ms)
  useEffect(() => {
    if (pendingSubStatuses.length > 0) {
      const nextStatus = pendingSubStatuses[0];
      
      // If it's real-time data, update immediately
      if (nextStatus.startsWith('RECEIVING DATA:')) {
        setSubStatus(nextStatus);
        setPendingSubStatuses(prev => prev.slice(1));
        return;
      }

      // For technical steps, show them one by one with a delay
      const timer = setTimeout(() => {
        setSubStatus(nextStatus);
        setPendingSubStatuses(prev => prev.slice(1));
      }, 750);

      return () => clearTimeout(timer);
    }
  }, [pendingSubStatuses, subStatus]);

  // Smooth Interpolator: Glides 'progress' towards 'targetProgress'
  useEffect(() => {
    let interval;
    if (loading || status === 'completed') {
      // 60 FPS update for buttery smooth movement
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= targetProgress) return prev;
          const diff = targetProgress - prev;
          // Fluid step: move faster when far, but always maintain a smooth minimum
          const step = diff > 1 ? diff * 0.08 : 0.05;
          return Math.min(prev + step, targetProgress);
        });
      }, 16);
    }
    return () => clearInterval(interval);
  }, [loading, targetProgress, status]);

  // Simulation Logic: Only updates 'targetProgress'
  useEffect(() => {
    let interval;
    if (status === 'fetching_info') {
      // Higher frequency simulation for a more continuous glide
      interval = setInterval(() => {
        setTargetProgress(prev => {
          if (prev >= 90) return prev;
          const increment =
            prev < 50 ? Math.random() * 0.6 + 0.2 : Math.random() * 0.2 + 0.05;
          return Math.min(prev + increment, 90);
        });
      }, 50);
    } else if (status === 'initializing') {
      interval = setInterval(() => {
        setTargetProgress(prev => {
          if (prev >= 20) return prev;
          return Math.min(prev + 0.2, 20);
        });
      }, 80);
    }
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (url.toLowerCase().includes('spotify.com')) {
      setSelectedFormat('mp3');
    }
  }, [url]);

  const handleDownloadTrigger = async e => {
    if (e) e.preventDefault();
    if (!url) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('fetching_info');
    setPendingSubStatuses(['Connecting to API network...']);
    setSubStatus('');
    setVideoTitle(''); // Reset title so previous one doesn't show
    setProgress(0);
    setTargetProgress(1);

    const clientId = Date.now().toString();
    const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    const eventSource = new EventSource(`${BACKEND_URL}/events?id=${clientId}`);

    const connectionPromise = new Promise(resolve => {
      eventSource.onopen = () => resolve();
      eventSource.onerror = () => resolve();
      setTimeout(resolve, 2000);
    });

    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.status) setStatus(data.status);
        if (data.subStatus) {
          setPendingSubStatuses(prev => [...prev, data.subStatus]);
        }
        if (data.progress !== undefined) {
          setTargetProgress(prev => Math.max(prev, data.progress));
        }
      } catch (e) {
        console.error(e);
      }
    };

    try {
      await connectionPromise;

      const response = await fetch(
        `${BACKEND_URL}/info?url=${encodeURIComponent(url)}&id=${clientId}`,
        {
          headers: {
            'ngrok-skip-browser-warning': 'true',
            'bypass-tunnel-reminder': 'true'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch video details');
      }

      const data = await response.json();

      if (data.spotifyMetadata?.isrc) {
        console.log(`[Frontend] ISRC found: ${data.spotifyMetadata.isrc}`);
      } else if (url.includes('spotify.com')) {
        console.log('[Frontend] No ISRC found for this Spotify track.');
      }

      if (url.includes('spotify.com')) {
        setSelectedFormat('mp3');
      }

      setProgress(100);
      setVideoData(data);
      setIsPickerOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      eventSource.close();
    }
  };

  const handleDownload = async (formatId, metadataOverrides = {}) => {
    setIsPickerOpen(false);
    setLoading(true);
    setError('');
    setProgress(0);
    setTargetProgress(1);
    setStatus('initializing');
    setPendingSubStatuses(['Preparing background tasks...']);
    setSubStatus('');

    const finalTitle = metadataOverrides.title || videoData?.title || '';
    setVideoTitle(finalTitle);
    titleRef.current = finalTitle;

    const clientId = Date.now().toString();
    const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    const eventSource = new EventSource(`${BACKEND_URL}/events?id=${clientId}`);

    const connectionPromise = new Promise(resolve => {
      eventSource.onopen = () => resolve();
      eventSource.onerror = () => resolve();
      setTimeout(resolve, 2000);
    });

    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'error') {
          setError(data.message);
          setLoading(false);
          eventSource.close();
        } else {
          if (data.status) setStatus(data.status);
          if (data.subStatus) {
            setPendingSubStatuses(prev => [...prev, data.subStatus]);
          }
          if (data.progress !== undefined) {
            setTargetProgress(prev => Math.max(prev, data.progress));
          }

          if (data.title && !metadataOverrides.title) {
            setVideoTitle(data.title);
            titleRef.current = data.title;
          }

          if (data.status === 'sending') {
            setPendingSubStatuses(prev => [...prev, 'Preparing for Transfer...']);
            setTargetProgress(100);
            setTimeout(() => {
              setLoading(false);
              setStatus('completed');
              eventSource.close();
            }, 1500);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    try {
      await connectionPromise;

      const queryParams = new URLSearchParams({
        url: url,
        id: clientId,
        format: selectedFormat,
        formatId: formatId,
        title: finalTitle,
        artist: metadataOverrides.artist || videoData?.artist || '',
        album: metadataOverrides.album || videoData?.album || '',
        imageUrl: videoData?.cover || '',
        year: videoData?.spotifyMetadata?.year || '',
        targetUrl: videoData?.spotifyMetadata?.targetUrl || ''
      });

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `${BACKEND_URL}/convert`;

      queryParams.forEach((value, key) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);

    } catch (err) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred');
      setLoading(false);
      eventSource.close();
    }
  };

  const getStatusText = () => {
    const formatName = selectedFormat === 'mp4' ? 'video' : 'audio';
    switch (status) {
      case 'fetching_info':
        return progress > 0
          ? `Analyzing ${formatName} (${Math.floor(progress)}%)`
          : `Analyzing ${formatName}...`;
      case 'downloading':
        return `Downloading (${Math.floor(progress)}%)`;
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

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  };

  return (
    <div className='flex flex-col justify-center items-center w-full gap-3 px-4'>
      <img
        className={`transition-all duration-700 ease-in-out object-contain ${
          loading || status === 'completed'
            ? 'w-44 sm:w-48 md:w-52 mb-1'
            : 'w-52 sm:w-56 md:w-64 mb-2'
        }`}
        src={meowCool}
        alt='cool cat'
      />
      <div className='w-full max-w-md flex items-center relative'>
        <div className='absolute inset-y-0 left-1 flex items-center pl-1'>
          <div className='relative flex items-center justify-center'>
            <span className='animate-ping absolute inline-flex h-2/3 w-2/3 rounded-full bg-cyan-500 opacity-50'></span>
            <span className='relative p-1 rounded-full flex items-center justify-center'>
              <Link className='w-5 h-5 text-cyan-500' />
            </span>
          </div>
        </div>
        <input
          className='border-cyan-400 border-2 p-2 w-full rounded-xl placeholder-gray-500 pl-10 focus:outline-none bg-transparent text-white'
          type='text'
          placeholder='paste your link here'
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
      </div>
      <div className='w-full max-w-md mt-1'>
        <div className='flex bg-cyan-500 w-full rounded-2xl divide-x divide-white/30 overflow-hidden shadow-lg border-[0.5px] border-cyan-400/50'>
          <button
            disabled={url.toLowerCase().includes('spotify.com')}
            onClick={() => setSelectedFormat('mp4')}
            className={`btns flex-1 relative overflow-hidden transition-all duration-300 ${
              selectedFormat === 'mp4'
                ? 'scale-105 z-10 shadow-inner !text-white'
                : 'hover:bg-white/10 text-black'
            } ${
              url.toLowerCase().includes('spotify.com')
                ? 'opacity-40 filter grayscale-[0.8]'
                : ''
            }`}
          >
            <AnimatePresence>
              {selectedFormat === 'mp4' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className='absolute inset-0'
                >
                  <PurpleBackground />
                </motion.div>
              )}
            </AnimatePresence>
            <div className='relative z-10 flex items-center gap-2'>
              <VideoIcon size={29} className='text-cyan-900' />
              <span className='truncate'>Video</span>
            </div>
          </button>

          <button
            onClick={() => setSelectedFormat('mp3')}
            className={`btns flex-1 relative overflow-hidden transition-all duration-300 ${
              selectedFormat === 'mp3'
                ? 'scale-105 z-10 shadow-inner !text-white'
                : 'hover:bg-white/10 text-black'
            }`}
          >
            <AnimatePresence>
              {selectedFormat === 'mp3' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className='absolute inset-0'
                >
                  <PurpleBackground />
                </motion.div>
              )}
            </AnimatePresence>
            <div className='relative z-10 flex items-center gap-2'>
              <MusicIcon
                color={selectedFormat === 'mp3' ? '#fff' : '#000'}
                size={24}
              />
              <span className='truncate'>Audio</span>
            </div>
          </button>

          <button
            className='btns flex-1 hover:bg-white/10 transition-all text-black'
            onClick={handlePaste}
          >
            <PasteIcon size={24} />
            <span className='truncate'>Paste</span>
          </button>
        </div>
      </div>
      <div className='pt-2'>
        <GlowButton
          text={loading ? 'Processing...' : 'Convert & Download'}
          onClick={handleDownloadTrigger}
          disabled={loading}
        />
      </div>

      <QualityPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        selectedFormat={selectedFormat}
        videoData={videoData}
        onSelect={handleDownload}
      />

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className='w-full max-w-md mt-4 bg-black/20 rounded-2xl p-4 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
          >
            <div className='flex justify-between mb-1 text-xs text-cyan-400 font-bold tracking-tight'>
              <span className='flex items-center gap-2'>
                <Loader2 className='w-3 h-3 animate-spin' />
                {getStatusText()}
              </span>
              <span className='font-mono'>{Math.floor(progress)}%</span>
            </div>

            {/* Technical Sub-status */}
            <div className='text-[10px] text-cyan-300/60 font-mono mb-2 truncate uppercase tracking-widest pl-1 h-4 flex items-center overflow-hidden'>
              <AnimatePresence mode='wait'>
                {subStatus.startsWith('RECEIVING DATA:') ? (
                  <motion.div 
                    key='receiving-data'
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className='flex items-center w-full'
                  >
                    <span className='shrink-0'>RECEIVING DATA:&nbsp;</span>
                    <span className='text-cyan-400 font-bold tabular-nums'>
                      {subStatus.replace('RECEIVING DATA:', '').trim()}
                    </span>
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

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              transition: { type: 'spring', stiffness: 400, damping: 15 }
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            className='w-full max-w-md mt-6 relative group'
          >
            {/* Cyberpunk Glow Background */}
            <div className='absolute -inset-0.5 bg-gradient-to-r from-red-500 to-rose-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000'></div>
            
            <div className='relative flex items-center gap-4 bg-black/40 backdrop-blur-xl border border-red-500/30 p-4 rounded-2xl shadow-2xl overflow-hidden'>
              {/* Animated Danger Icon */}
              <div className='relative shrink-0'>
                <div className='absolute inset-0 bg-red-500 blur-lg opacity-40 animate-pulse'></div>
                <div className='relative bg-red-500/20 p-2.5 rounded-xl border border-red-500/50'>
                  <AlertCircle size={22} className='text-red-400' />
                </div>
              </div>

              <div className='flex-1 min-w-0'>
                <h4 className='text-red-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1'>System Alert</h4>
                <p className='text-gray-200 text-xs font-medium leading-relaxed break-words'>
                  {error}
                </p>
              </div>

              {/* Decorative Corner */}
              <div className='absolute top-0 right-0 p-1'>
                <div className='w-4 h-4 border-t-2 border-r-2 border-red-500/20 rounded-tr-lg'></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {status === 'completed' && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ 
            opacity: 1, 
            y: 0, 
            scale: 1,
            transition: { type: 'spring', stiffness: 400, damping: 15 }
          }}
          className='w-full max-w-md mt-6 relative group'
        >
          {/* Cyberpunk Success Glow */}
          <div className='absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000'></div>
          
          <div className='relative flex items-center gap-4 bg-black/40 backdrop-blur-xl border border-emerald-500/30 p-4 rounded-2xl shadow-2xl overflow-hidden'>
            {/* Animated Success Icon */}
            <div className='relative shrink-0'>
              <div className='absolute inset-0 bg-emerald-500 blur-lg opacity-40 animate-pulse'></div>
              <div className='relative bg-emerald-500/20 p-2.5 rounded-xl border border-emerald-500/50'>
                <CheckCircle2 size={22} className='text-emerald-400' />
              </div>
            </div>

            <div className='flex-1 min-w-0'>
              <h4 className='text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1'>Transfer Complete</h4>
              <p className='text-gray-200 text-xs font-medium leading-relaxed'>
                Successfully sent to your device.
              </p>
            </div>

            {/* Decorative Corner */}
            <div className='absolute top-0 right-0 p-1'>
              <div className='w-4 h-4 border-t-2 border-r-2 border-emerald-500/20 rounded-tr-lg'></div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default MainContent;
