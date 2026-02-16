import Header from './components/Header.jsx';
import MainContent from './components/MainContent.jsx';
import SocialMedia from './components/SocialMedia.jsx';
import DebugConsole from './components/utils/DebugConsole.jsx';
import SupportButton from './components/ui/SupportButton.jsx';
import DotPattern from './components/ui/DotPattern.jsx';
import ShootingStars from './components/ui/ShootingStars.jsx';


const App = () => {
  return (
    <div className='flex flex-col min-h-dvh w-screen relative overflow-hidden'>
      <title>NexStream | 4K Youtube & Spotify Converter</title>
      <meta name="description" content="Best Youtube converter and Spotify downloader. Support TikTok, Instagram, and Facebook. Download in 4K or MP3 high quality for free." />
      
      <DebugConsole />
      <DotPattern />
      <ShootingStars />
      {/* Background Blobs (Lowered opacity to complement DotPattern) */}
      <div className='fixed rounded-full blur-[120px] -z-10 opacity-20 animate-float w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-purple-900 -top-12 -left-12 sm:-top-24 sm:-left-24 pointer-events-none'></div>
      <div
        className='fixed rounded-full blur-[120px] -z-10 opacity-20 animate-float w-[350px] h-[350px] sm:w-[600px] sm:h-[600px] bg-blue-950 -bottom-20 -right-20 sm:-bottom-36 sm:-right-36 pointer-events-none'
        style={{ animationDelay: '-5s' }}
      ></div>

            <Header />
       
            <main className='grow flex items-center justify-center'>
              <MainContent />
            </main>
      <footer className='px-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] shrink-0 relative flex flex-col items-center justify-center'>
        <div className="sr-only">
          <h2>Ultimate Online Video Downloader and Converter</h2>
          <p>NexStream is a free online tool to download videos from YouTube, convert YouTube to MP3, and download Spotify playlists. 
             Our platform supports TikTok no watermark downloads, Instagram Reels saving, and Facebook video downloading in 4K quality. 
             Use our high-speed YouTube converter and Spotify to MP3 service for all your media needs.</p>
        </div>
        <SocialMedia />
        <div className='absolute right-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:right-4 sm:bottom-4 md:left-1/2 md:translate-x-[50px] md:bottom-auto md:top-1/2 md:-translate-y-1/2'>
          <SupportButton />
        </div>
      </footer>
    </div>
  );
};

export default App;