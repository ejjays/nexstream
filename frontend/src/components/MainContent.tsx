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

import SEO from './utils/SEO';
import { PlayerData } from '../types/remix';

const MusicPlayerCard = lazy(() => import('./MusicPlayerCard'));
const meowCool = '/meow.webp';

const HeroSection = ({ isVisible }: { isVisible: boolean }) => (
  <div className='relative flex flex-col items-center justify-center gap-4'>
    <div className='relative'>
      <img
        className={`transition-all duration-700 ease-in-out object-contain ${
          isVisible
            ? 'w-40 h-40 sm:w-44 sm:h-44 md:w-52 md:h-52'
            : 'w-52 h-52 sm:w-52 sm:h-52 md:w-56 md:h-56'
        }`}
        src={meowCool}
        alt='NexStream Mascot - A cool cat'
        width={208}
        height={208}
        loading='eager'
        fetchPriority='high'
        decoding='async'
      />
      <div className='absolute -right-4 -top-2 sm:-right-6 sm:-top-4 md:-right-14 md:-top-2 z-20'>
        <DocsButton />
      </div>
    </div>
    
    <div className="sr-only">
      <h1>NexStream | 4K Media Converter</h1>
      <p>Ultimate Youtube & Spotify Downloader</p>
    </div>
  </div>
);

const FormatButton = ({
  active,
  onClick,
  disabled,
  icon: Icon,
  label,
  "aria-label": ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ElementType;
  label: string;
  "aria-label"?: string;
}) => (
  <button
    disabled={disabled}
    onClick={onClick}
    aria-label={ariaLabel}
    className={`btns flex-1 relative overflow-hidden transition-all duration-300 ${
      active
        ? 'scale-105 z-10 shadow-inner !text-white'
        : 'hover:bg-white/10 text-black'
    } ${
      disabled ? 'opacity-40 filter grayscale-[0.8]' : ''
    }`}
  >
    <AnimatePresence>
      {active && (
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
      {typeof Icon === 'function' ? (
        <Icon size={label === 'Video' ? 29 : 24} className={label === 'Video' ? 'text-cyan-900' : undefined} color={label === 'Audio' ? (active ? '#fff' : '#000') : undefined} />
      ) : Icon}
      <span className='truncate'>{label}</span>
    </div>
  </button>
);

const FormatPicker = ({
  url,
  selectedFormat,
  setSelectedFormat,
  handlePaste
}: {
  url: string;
  selectedFormat: string;
  setSelectedFormat: (format: string) => void;
  handlePaste: (e?: React.MouseEvent | React.TouchEvent) => void | Promise<void>;
}) => (
  <div className='w-full max-w-md mt-1'>
    <div className='flex bg-cyan-500 w-full rounded-2xl divide-x divide-white/30 overflow-hidden shadow-lg border-[0.5px] border-cyan-400/50'>
      <FormatButton
        label="Video"
        active={selectedFormat === 'mp4'}
        disabled={url.toLowerCase().includes('spotify.com')}
        onClick={() => setSelectedFormat('mp4')}
        icon={VideoIcon}
        aria-label="Select Video (MP4) format"
      />
      <FormatButton
        label="Audio"
        active={selectedFormat === 'mp3'}
        onClick={() => setSelectedFormat('mp3')}
        icon={MusicIcon}
        aria-label="Select Audio (MP3) format"
      />
      <button
        className='btns flex-1 hover:bg-white/10 transition-all text-black'
        onClick={(e) => handlePaste(e)}
        aria-label="Paste URL from clipboard"
      >
        <PasteIcon size={24} />
        <span className='truncate'>Paste</span>
      </button>
    </div>
  </div>
);

const SearchInput = ({
  url,
  setUrl
}: {
  url: string;
  setUrl: (url: string) => void;
}) => (
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
);

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
  const playerData = useRemixStore((state) => state.playerData) as PlayerData | null;

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

  const isVisible = Boolean(status !== 'idle' || loading || error || isPickerOpen);

  return (
    <>
      <SEO 
        title="4K Youtube & Spotify Converter" 
        description="Best Youtube converter and Spotify downloader. Support TikTok, Instagram, and Facebook. Download in 4K or MP3 high quality for free."
        canonicalUrl="/"
        schema={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "NexStream",
          "operatingSystem": "All",
          "applicationCategory": "MultimediaApplication",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
          },
          "description": "4K Youtube & Spotify Converter. Download and convert media from various platforms easily."
        }}
      />
      <div
        className={`flex flex-col justify-center items-center w-full gap-3 px-4 transition-transform duration-500 ease-in-out ${
          isVisible && isMobile
            ? '-translate-y-6 sm:-translate-y-8'
            : 'translate-y-0'
        }`}
      >
        <HeroSection isVisible={isVisible} />
        <SearchInput url={url} setUrl={setUrl} />
        <FormatPicker
          url={url}
          selectedFormat={selectedFormat}
          setSelectedFormat={setSelectedFormat}
          handlePaste={handlePaste}
        />
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
              videoData={videoData as Record<string, unknown>}
              onSelect={(qualityId, metadata) =>
                handleDownload(metadata?.extension || 'mp3', qualityId, metadata)
              }
            />
          ) : (
            <StandardQualityPicker
              isOpen={isPickerOpen}
              onClose={() => setIsPickerOpen(false)}
              selectedFormat={selectedFormat}
              videoData={videoData as Record<string, unknown>}
              onSelect={(qualityId, metadata) =>
                handleDownload(metadata?.extension || selectedFormat, qualityId, metadata)
              }
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
