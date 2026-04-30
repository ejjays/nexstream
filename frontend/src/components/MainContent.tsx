import { lazy, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link as LinkIcon } from 'lucide-react';
import MusicIcon from '../assets/icons/MusicIcon';
import PasteIcon from '../assets/icons/PasteIcon';
import GlowButton from './ui/GlowButton';
import VideoIcon from '../assets/icons/VideoIcon';
import PurpleBackground from './ui/PurpleBackground';
import MobileProgress from './MobileProgress';
import DesktopProgress from './DesktopProgress';
import { useMediaConverter } from '../hooks/useMediaConverter';
import { useRemixStore } from '../store/useRemixStore';
import StandardQualityPicker from './modals/StandardQualityPicker';
import MobileSpotifyPicker from './modals/MobileSpotifyPicker';
import DocsButton from './ui/DocsButton';
import FloatingMenu from './ui/FloatingMenu';

const MusicPlayerCard = lazy(() => import('./MusicPlayerCard'));
const meowCool = '/meow.webp';

const MainContent = () => {
  const url = useRemixStore((state) => state.url);
  const setUrl = useRemixStore((state) => state.setUrl);
  const loading = useRemixStore((state) => state.loading);
  const error = useRemixStore((state) => state.error);
  const status = useRemixStore((state) => state.status);
  const videoData = useRemixStore((state) => state.videoData);
  const isPickerOpen = useRemixStore((state) => state.isPickerOpen);
  const setIsPickerOpen = useRemixStore((state) => state.setIsPickerOpen);
  const selectedFormat = useRemixStore((state) => state.selectedFormat);
  const setSelectedFormat = useRemixStore((state) => state.setSelectedFormat);
  const videoTitle = useRemixStore((state) => state.videoTitle);
  const showPlayer = useRemixStore((state) => state.showPlayer);
  const setShowPlayer = useRemixStore((state) => state.setShowPlayer);
  const playerData = useRemixStore((state) => state.playerData);

  const {
    progress,
    subStatus,
    desktopLogs,
    isMobile,
    isSpotifySession,
    handleDownloadTrigger,
    handleDownload,
    handlePaste
  } = useMediaConverter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        const demoUrl = 'https://open.spotify.com/track/5dbNhoJHwTFykNZJnCBMuL?si=bJUpF9PvSmGFkyaM3Rontg';
        setUrl(demoUrl);
      }

      if (e.key === 'Enter' && !loading && url) {
        e.preventDefault();
        handleDownloadTrigger();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [url, loading, setUrl, handleDownloadTrigger]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl =
      params.get('url') || params.get('text') || params.get('title');

    if (sharedUrl) {
      const urlMatch = sharedUrl.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        const finalUrl = urlMatch[0];
        setUrl(finalUrl);
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        setTimeout(() => {
          handleDownloadTrigger(finalUrl);
        }, 100);
      }
    }
  }, [handleDownloadTrigger, setUrl]);

  const isVisible = status !== 'idle' || loading || error || isPickerOpen;

  return (
    <>
      <div
        className={`flex flex-col justify-center items-center w-full gap-3 px-4 transition-transform duration-500 ease-in-out ${
          isVisible && isMobile
            ? '-translate-y-6 sm:-translate-y-8'
            : 'translate-y-0'
        }`}
      >
        <div className='relative flex items-center justify-center'>
          <img
            className={`transition-all duration-700 ease-in-out object-contain ${
              isVisible
                ? 'w-40 sm:w-44 md:w-52 mb-1'
                : 'w-52 sm:w-52 md:w-56 mb-2'
            }`}
            src={meowCool}
            alt='cool cat'
            width={208}
            height={208}
            loading='eager'
            fetchPriority='high'
          />
          <div className='absolute -right-4 -top-2 sm:-right-6 sm:-top-4 md:-right-14 md:-top-2 z-20'>
            <DocsButton />
          </div>
        </div>
        <div className='w-full max-w-md flex items-center relative'>
          <div className='absolute inset-y-0 left-1 flex items-center pl-1'>
            <div className='relative flex items-center justify-center'>
              <span className='animate-ping absolute inline-flex h-2/3 w-2/3 rounded-full bg-cyan-500 opacity-50'></span>
              <span className='relative p-1 rounded-full flex items-center justify-center'>
                <LinkIcon className='w-5 h-5 text-cyan-500' />
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
            onClick={() => handleDownloadTrigger()}
            disabled={loading}
          />
        </div>

        <Suspense fallback={null}>
          {isSpotifySession && isMobile ? (
            <MobileSpotifyPicker
              isOpen={isPickerOpen}
              onClose={() => setIsPickerOpen(false)}
              videoData={videoData}
              onSelect={(qualityId, metadata: any) => handleDownload(metadata.extension || 'mp3', qualityId)}
            />
          ) : (
            <StandardQualityPicker
              isOpen={isPickerOpen}
              onClose={() => setIsPickerOpen(false)}
              selectedFormat={selectedFormat}
              videoData={videoData}
              onSelect={(qualityId, metadata) => handleDownload(selectedFormat, qualityId)}
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
          error={error}
        />

        <DesktopProgress
          loading={loading}
          progress={progress}
          status={status}
          subStatus={subStatus}
          desktopLogs={desktopLogs}
          videoTitle={videoTitle}
          selectedFormat={selectedFormat}
          error={error}
          isPickerOpen={isPickerOpen}
        />
      </div>
      <FloatingMenu />
    </>
  );
};

export default MainContent;
