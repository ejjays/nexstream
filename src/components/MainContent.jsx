import { lazy, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'lucide-react';
import MusicIcon from '../assets/icons/MusicIcon.jsx';
import PasteIcon from '../assets/icons/PasteIcon.jsx';
import GlowButton from './ui/GlowButton.jsx';
import VideoIcon from '../assets/icons/VideoIcon.jsx';
import PurpleBackground from './ui/PurpleBackground.jsx';
import MobileProgress from './MobileProgress.jsx';
import DesktopProgress from './DesktopProgress.jsx';
import StatusBanner from './StatusBanner.jsx';
import { useMediaConverter } from '../hooks/useMediaConverter';
import StandardQualityPicker from './modals/StandardQualityPicker.jsx';
import MobileSpotifyPicker from './modals/MobileSpotifyPicker.jsx';

const MusicPlayerCard = lazy(() => import('./MusicPlayerCard.jsx'));

const meowCool = '/meow.webp';

const MainContent = () => {
  const {
    url, setUrl, loading, error, progress, status, subStatus, desktopLogs,
    videoTitle, selectedFormat, setSelectedFormat, isPickerOpen, setIsPickerOpen,
    videoData, showPlayer, setShowPlayer, playerData, isMobile,
    handleDownloadTrigger, handleDownload, handlePaste
  } = useMediaConverter();

  // Handle PWA Share Target
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text') || params.get('title');
    
    if (sharedUrl) {
      // Regex to extract URL from text (common in YouTube shares)
      const urlMatch = sharedUrl.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        const finalUrl = urlMatch[0];
        setUrl(finalUrl);
        // Remove the query params from the URL bar without refreshing
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Short delay to ensure state update before triggering
        setTimeout(() => {
          const mockEvent = { preventDefault: () => {} };
          handleDownloadTrigger(mockEvent, finalUrl);
        }, 100);
      }
    }
  }, []);

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
        fetchPriority='high'
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
          <MobileSpotifyPicker
            isOpen={isPickerOpen}
            onClose={() => setIsPickerOpen(false)}
            videoData={videoData}
            onSelect={handleDownload}
          />
        ) : (
          <StandardQualityPicker
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