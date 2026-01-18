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
  const [status, setStatus] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const titleRef = useRef('');

  // Smooth progress simulation for Analysis phase
  useEffect(() => {
    let interval;
    if (status === 'fetching_info' || status === 'initializing') {
      interval = setInterval(() => {
        setProgress(prev => {
          // Slow down as we get closer to 90%
          if (prev >= 90) return prev;
          const increment = prev < 50 ? Math.random() * 2 + 0.5 : Math.random() * 0.5 + 0.1;
          return Math.min(prev + increment, 90);
        });
      }, 100);
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
    setProgress(1); // Start at 1% to show immediate feedback

    const clientId = Date.now().toString();
    const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    const eventSource = new EventSource(`${BACKEND_URL}/events?id=${clientId}`);

    // Wait for connection
    const connectionPromise = new Promise((resolve) => {
      eventSource.onopen = () => {
        resolve();
      };
      eventSource.onerror = (e) => {
        console.error('[Frontend] Info SSE Error', e);
        resolve(); // Proceed anyway
      };
      setTimeout(resolve, 2000);
    });

    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.status) {
          setStatus(data.status);
          if (data.progress !== undefined) {
            setProgress(data.progress);
          }
        }
      } catch (e) { console.error(e); }
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

      // Log ISRC if found
      if (data.spotifyMetadata?.isrc) {
        console.log(`[Frontend] ISRC found: ${data.spotifyMetadata.isrc}`);
      } else if (url.includes('spotify.com')) {
        console.log('[Frontend] No ISRC found for this Spotify track.');
      }

      // If it's a Spotify link, force audio format
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
    setProgress(1);
    setStatus('initializing');

    const finalTitle = metadataOverrides.title || videoData?.title || '';
    setVideoTitle(finalTitle);
    titleRef.current = finalTitle;

    const clientId = Date.now().toString();
    const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    const eventSource = new EventSource(`${BACKEND_URL}/events?id=${clientId}`);

    // Wait for connection
    const connectionPromise = new Promise((resolve) => {
      eventSource.onopen = () => {
        resolve();
      };
      eventSource.onerror = (e) => {
        console.error('[Frontend] Convert SSE Error', e);
        resolve(); // Proceed anyway
      };
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
          // Ignore backend progress for initializing (we simulate it)
          if (data.status === 'initializing') {
            setStatus(data.status); 
          } else {
             setStatus(data.status);
             if (data.progress !== undefined) {
               if (data.status === 'downloading' && data.progress === 0) {
                 setProgress(1);
               } else {
                 setProgress(data.progress);
               }
             }
          }
          
          if (data.title && !metadataOverrides.title) {
            setVideoTitle(data.title);
            titleRef.current = data.title;
          }

          // Since we use direct download link, we treat 'sending' as effectively done for the UI
          if (data.status === 'sending') {
            setTimeout(() => {
              setLoading(false);
              setStatus('completed');
              setProgress(100);
              eventSource.close();
            }, 1000);
          }
        }
      } catch (e) { console.error(e); }
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

      // Use hidden form submission (POST) to handle large payloads (like Base64 images)
      // that would otherwise break the URL length limit in a GET request.
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `${BACKEND_URL}/convert`;
      // form.target = '_blank'; // Optional: Use if you want to debug errors in a new tab

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

      // We rely on SSE 'sending' status to finish the UI state
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
      case 'getting_metadata':
        return 'Getting Spotify metadata...';
      case 'fetching_isrc':
        return 'Fetching ISRC code...';
      case 'searching_youtube_isrc':
        return 'Searching YouTube via ISRC...';
      case 'ai_matching':
        return 'Using AI to find best match...';
      case 'searching_youtube':
        return 'Searching YouTube...';
      case 'downloading':
        return `Downloading (${Math.floor(progress)}%)`;
      case 'merging':
        return 'Finalizing file (almost done)...';
      case 'sending':
        return 'Sending to device...';
      case 'completed':
        return 'Complete!';
      case 'initializing':
        return progress > 0 ? `Preparing (${Math.floor(progress)}%)` : 'Initializing...';
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
      <img className='w-56' src={meowCool} alt='cool cat' />
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
            className='w-full max-w-md mt-4 bg-black/20 rounded-2xl p-4 border border-cyan-500/30'
          >
            <div className='flex justify-between mb-2 text-xs text-cyan-400'>
              <span className='flex items-center gap-2'>
                <Loader2 className='w-3 h-3 animate-spin' />
                {getStatusText()}
              </span>
              <span>{Math.floor(progress)}%</span>
            </div>

            <div className='w-full h-1.5 bg-white/5 rounded-full overflow-hidden relative'>
              <motion.div
                className='h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full relative'
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.2, ease: 'linear' }}
              >
                <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]'></div>
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className='w-full max-w-md mt-4 bg-red-500/10 text-red-300 p-3 rounded-xl border border-red-500/20 flex items-center gap-2 text-xs'
          >
            <AlertCircle size={16} className='shrink-0' />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {status === 'completed' && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className='mt-4 text-emerald-400 flex items-center justify-center gap-2 text-sm font-medium'
        >
          <CheckCircle2 size={16} />
          <span>Success! File downloaded.</span>
        </motion.div>
      )}
    </div>
  );
};

export default MainContent;
