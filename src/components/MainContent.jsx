import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// Use stable public path for better preloading
const meowCool = '/meow.webp';
import {
  Link
} from 'lucide-react';
import YouTubeIcon from '../assets/icons/YouTubeIcon.jsx';
import MusicIcon from '../assets/icons/MusicIcon.jsx';
import PasteIcon from '../assets/icons/PasteIcon.jsx';
import GlowButton from './ui/GlowButton.jsx';
import VideoIcon from '../assets/icons/VideoIcon.jsx';
import PurpleBackground from './ui/PurpleBackground.jsx';
import MobileProgress from './MobileProgress.jsx';
import DesktopProgress from './DesktopProgress.jsx';
import StatusBanner from './StatusBanner.jsx';
import { BACKEND_URL } from '../lib/config';

// Lazy load heavy components
const QualityPicker = lazy(() => import('./modals/QualityPicker.jsx'));
const SpotifyQualityPicker = lazy(() => import('./modals/SpotifyQualityPicker.jsx'));
const MusicPlayerCard = lazy(() => import('./MusicPlayerCard.jsx'));

const MainContent = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [subStatus, setSubStatus] = useState('');
  const [desktopLogs, setDesktopLogs] = useState([]);
  const [pendingSubStatuses, setPendingSubStatuses] = useState([]);
  const [videoTitle, setVideoTitle] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerData, setPlayerData] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const titleRef = useRef('');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

    // Client-side Spotify Validation
    if (url.toLowerCase().includes('spotify.com') && !url.toLowerCase().includes('/track/')) {
        setError('Please use a direct Spotify track link. Artist, Album, and Playlist links are not supported.');
        setLoading(false);
        return;
    }

    setStatus('fetching_info');
    setPendingSubStatuses(['Connecting to API network...']);
    setSubStatus('');
    setDesktopLogs(['Connecting to API network...']);
    setVideoTitle(''); // Reset title so previous one doesn't show
    setProgress(0);
    setTargetProgress(1);

    const clientId = Date.now().toString();
    const eventSource = new EventSource(`${BACKEND_URL}/events?id=${clientId}`);

    // Non-blocking connection check
    eventSource.onopen = () => console.log('[SSE] Connection Established');
    eventSource.onerror = () => {
      console.warn('[SSE] Connection failed or interrupted');
      // Don't close immediately, EventSource will auto-retry
    };

    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.status) setStatus(data.status);
        if (data.subStatus) {
          // Both get subStatus
          if (data.subStatus.startsWith('STREAM ESTABLISHED')) {
            setSubStatus(data.subStatus);
          } else {
            setPendingSubStatuses(prev => [...prev, data.subStatus]);
          }
          setDesktopLogs(prev => [...prev, data.subStatus]);
        }
        // ONLY desktop gets details
        if (data.details) {
          setDesktopLogs(prev => [...prev, data.details]);
        }
        if (data.progress !== undefined) {
          setTargetProgress(prev => Math.max(prev, data.progress));
        }
      } catch (e) {
        console.error(e);
      }
    };

    try {
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
      console.log('[Debug] Fetched Video Data:', data);
      setVideoData(data);

      if (url.toLowerCase().includes('spotify.com')) {
        setSelectedFormat('mp3');
        const spotify = data.spotifyMetadata;
        console.log('[Debug] Spotify Metadata:', spotify);

        if (spotify && spotify.previewUrl) {
          console.log('[Debug] Showing Player with:', spotify.previewUrl);
          setPlayerData({
            title: spotify.title,
            artist: spotify.artist,
            imageUrl: spotify.cover || spotify.imageUrl || data.cover,
            previewUrl: spotify.previewUrl
          });
          setShowPlayer(true);
        } else {
          console.warn('[Debug] No Preview URL found in metadata');
        }
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
    setDesktopLogs([]);

    const finalTitle = metadataOverrides.title || videoData?.title || '';
    setVideoTitle(finalTitle);
    titleRef.current = finalTitle;

    const clientId = Date.now().toString();

    const eventSource = new EventSource(`${BACKEND_URL}/events?id=${clientId}`);

    eventSource.onopen = () => console.log('[SSE] Connection Established');
    eventSource.onerror = () => console.warn('[SSE] Connection failed');

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
            if (data.subStatus.startsWith('STREAM ESTABLISHED')) {
              setSubStatus(data.subStatus);
            } else {
              setPendingSubStatuses(prev => [...prev, data.subStatus]);
            }
            setDesktopLogs(prev => [...prev, data.subStatus]);
          }
          // ONLY desktop gets details
          if (data.details) {
            setDesktopLogs(prev => [...prev, data.details]);
          }
          if (data.progress !== undefined) {
            setTargetProgress(prev => Math.max(prev, data.progress));
          }

          if (data.title && !metadataOverrides.title) {
            setVideoTitle(data.title);
            titleRef.current = data.title;
          }

          // INSTANT SUCCESS: When stream starts, transition immediately
          if (data.status === 'downloading' && data.progress === 100) {
            setTargetProgress(100);
            setTimeout(() => {
              setLoading(false);
              setStatus('completed');
              eventSource.close();
            }, 800);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    try {
      // Find the selected format to get the filesize and extension
      const selectedOption = (
        selectedFormat === 'mp4' ? videoData?.formats : videoData?.audioFormats
      )?.find(f => f.format_id === formatId);

      // Determine the correct format to send to backend
      // If user selected a specific option (like m4a/webm), use its extension.
      // If it's the special 'mp3' option (formatId='mp3'), use 'mp3'.
      // Fallback to selectedFormat state if nothing else matches.
      const finalFormatParam =
        selectedOption?.extension ||
        (formatId === 'mp3' ? 'mp3' : selectedFormat);

      const queryParams = new URLSearchParams({
        url: url,
        id: clientId,
        format: finalFormatParam,
        formatId: formatId,
        filesize: selectedOption?.filesize || '',
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
            : 'w-52 sm:w-52 md:w-56 mb-2'
        }`}
        src={meowCool}
        alt='cool cat'
        width={208}
        height={208}
        loading='eager'
        fetchpriority='high'
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

      <Suspense fallback={null}>
        {videoData?.spotifyMetadata && isMobile ? (
          <SpotifyQualityPicker
            isOpen={isPickerOpen}
            onClose={() => setIsPickerOpen(false)}
            videoData={videoData}
            onSelect={handleDownload}
          />
        ) : (
          <QualityPicker
            isOpen={isPickerOpen}
            onClose={() => setIsPickerOpen(false)}
            selectedFormat={selectedFormat}
            videoData={videoData}
            onSelect={handleDownload}
          />
        )}

        <MusicPlayerCard
          isVisible={showPlayer}
          data={playerData}
          onClose={() => setShowPlayer(false)}
        />
      </Suspense>

      <MobileProgress
        loading={loading}
        progress={progress}
        status={status}
        subStatus={subStatus}
        videoTitle={videoTitle}
        selectedFormat={selectedFormat}
      />

      <DesktopProgress
        loading={loading}
        progress={progress}
        status={status}
        desktopLogs={desktopLogs}
        videoTitle={videoTitle}
        selectedFormat={selectedFormat}
        error={error}
        isPickerOpen={isPickerOpen}
      />

      <StatusBanner error={error} status={status} loading={loading} />
    </div>
  );
};

export default MainContent;
