import Header from './components/Header.jsx';
import MainContent from './components/MainContent.jsx';
import SocialMedia from './components/SocialMedia.jsx';
import DebugConsole from './components/utils/DebugConsole.jsx';
import SupportButton from './components/ui/SupportButton.jsx';
import DotPattern from './components/ui/DotPattern.jsx';
import ShootingStars from './components/ui/ShootingStars.jsx';


const App = () => {
  return (
    <div className='flex flex-col min-h-dvh w-full relative overflow-x-hidden bg-[#030014]'>
      <title>NexStream | 4K Youtube & Spotify Converter</title>
      <meta name="description" content="Best Youtube converter and Spotify downloader. Support TikTok, Instagram, and Facebook. Download in 4K or MP3 high quality for free." />
      
      <DebugConsole />
      
      {/* BACKGROUND LAYER */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="noise-overlay" />
        <DotPattern />
        <ShootingStars />
        
        <div 
          className='absolute animate-float w-[600px] h-[600px] -top-20 -left-20 opacity-30'
          style={{ background: 'radial-gradient(circle, rgba(88, 28, 135, 0.4) 0%, transparent 70%)' }}
        />
        <div 
          className='absolute animate-float w-[700px] h-[700px] -bottom-36 -right-36 opacity-25'
          style={{ background: 'radial-gradient(circle, rgba(23, 37, 84, 0.5) 0%, transparent 70%)', animationDelay: '-5s' }}
        />
      </div>

      <Header />
       
      {/* MAIN: Full Width Centering */}
      <main className='flex-1 flex flex-col items-center justify-center w-full z-10'>
        <MainContent />
      </main>

      <footer className='w-full shrink-0 relative z-50 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 flex flex-col items-center justify-center'>
        <SocialMedia />
        <div className='absolute right-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:right-4 sm:bottom-4 md:left-1/2 md:translate-x-[50px] md:bottom-auto md:top-1/2 md:-translate-y-1/2'>
          <SupportButton />
        </div>
      </footer>
    </div>
  );
};

export default App;
