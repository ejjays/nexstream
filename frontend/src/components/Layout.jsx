import React from 'react';
import { Link } from 'react-router-dom';
import Header from './Header.jsx';
import SocialMedia from './SocialMedia.jsx';
import SupportButton from './ui/SupportButton.jsx';
import DocsButton from './ui/DocsButton.jsx';
import DotPattern from './ui/DotPattern.jsx';
import ShootingStars from './ui/ShootingStars.jsx';
import ErudaLoader from './utils/ErudaLoader.jsx';

const Layout = ({ children }) => {
  return (
    <div className='flex flex-col min-h-dvh w-full relative overflow-hidden'>
      <ErudaLoader />
      <DotPattern />
      <ShootingStars />

      <div className='fixed rounded-full blur-[120px] -z-10 opacity-20 animate-float w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-purple-900 -top-12 -left-12 sm:-top-24 sm:-left-24 pointer-events-none'></div>
      <div
        className='fixed rounded-full blur-[120px] -z-10 opacity-20 animate-float w-[350px] h-[350px] sm:w-[600px] sm:h-[600px] bg-blue-950 -bottom-20 -right-20 sm:-bottom-36 sm:-right-36 pointer-events-none'
        style={{ animationDelay: '-5s' }}
      ></div>

      <Header />

      <main className='grow flex items-center justify-center pt-4 md:pt-0'>
        {children}
      </main>

      <footer className='px-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] shrink-0 relative flex flex-col items-center justify-center gap-4'>
        <div className='sr-only'>
          <h2>Ultimate Online Video Downloader and Converter</h2>
          <p>
            NexStream is a free online tool to download videos from YouTube,
            convert YouTube to MP3, and download Spotify playlists.
          </p>
        </div>
        <SocialMedia />
        <div className='absolute right-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:right-4 sm:bottom-4 md:left-1/2 md:translate-x-[50px] md:bottom-auto md:top-1/2 md:-translate-y-1/2'>
          <SupportButton />
        </div>
      </footer>
    </div>
  );
};

export default Layout;
