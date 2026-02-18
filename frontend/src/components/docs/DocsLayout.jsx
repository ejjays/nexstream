import React from 'react';
import DocsSidebar from './DocsSidebar.jsx';
import DotPattern from '../ui/DotPattern.jsx';
import ShootingStars from '../ui/ShootingStars.jsx';

const DocsLayout = ({ children }) => {
  return (
    <div className='fixed inset-0 flex w-full bg-[#030014] overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-200'>
      <div className='absolute inset-0 z-0 pointer-events-none'>
        <DotPattern showBackground={false} />
        <ShootingStars />
      </div>
      
      <DocsSidebar />

      <main className='flex-1 lg:pl-72 h-full relative z-10 overflow-y-auto px-6 py-12 md:px-12 md:py-16 scroll-smooth'>
        <div className='fixed rounded-full blur-[120px] -z-10 opacity-[0.05] w-[400px] h-[400px] bg-cyan-900 top-0 right-0 pointer-events-none'></div>
        <div className='fixed rounded-full blur-[120px] -z-10 opacity-[0.05] w-[500px] h-[500px] bg-purple-900 bottom-0 left-0 pointer-events-none'></div>

        <div className='max-w-4xl mx-auto'>
          {children}
        </div>
      </main>
    </div>
  );
};

export default DocsLayout;
