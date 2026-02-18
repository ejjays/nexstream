import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Video,
  Monitor,
  Smartphone,
  Layers,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  PlayCircle
} from 'lucide-react';

const VideoGuide = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'NexStream | Video Standards & Ultra-Resolution';
  }, []);

  const features = [
    {
      icon: <Monitor className='text-cyan-400' />,
      title: '8K & 4K Ultra-Resolution',
      text: 'NexStream scales beyond standard HD, resolving the massive 4320p (8K) and 2160p (4K) master manifests for the ultimate visual fidelity.'
    },
    {
      icon: <PlayCircle className='text-purple-400' />,
      title: '60FPS+ High Frame Rate',
      text: 'We support HFR streams (60fps and 120fps), preserving the fluid motion of modern gaming and action content.'
    },
    {
      icon: <Smartphone className='text-emerald-400' />,
      title: 'Gallery Optimized',
      text: "Our engine optimizes file headers so your 4K/8K downloads are immediately playable in your phone's native gallery."
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className='w-full flex flex-col gap-12'
    >
      <header className='text-center space-y-4'>
        <div className='inline-flex items-center gap-2 px-4 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4'>
          <Video size={12} /> Pro Video Extraction
        </div>
        <h1 className='text-4xl md:text-6xl font-black uppercase tracking-tighter text-white'>
          Video <span className='text-cyan-400'>Standards</span>
        </h1>
        <p className='text-gray-400 text-lg font-medium max-w-2xl mx-auto'>
          Pushing the limits of extraction with support for 8K resolution and
          60fps high frame rates.
        </p>
      </header>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {features.map((f, i) => (
          <div
            key={i}
            className='bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl hover:bg-white/10 transition-all group'
          >
            <div className='mb-6 transform group-hover:scale-110 transition-transform'>
              {f.icon}
            </div>
            <h3 className='text-white font-bold text-xl mb-3'>{f.title}</h3>
            <p className='text-gray-400 text-sm leading-relaxed'>{f.text}</p>
          </div>
        ))}
      </div>

      {/* 4K Recommendation Section */}
      <section className='bg-cyan-500/5 border border-cyan-500/20 p-8 rounded-[2.5rem] relative overflow-hidden'>
        <div className='absolute top-0 right-0 p-8 opacity-10'>
          <Monitor size={120} className='text-cyan-500' />
        </div>
        <div className='relative z-10 space-y-4'>
          <h2 className='text-2xl font-black text-white uppercase tracking-tighter'>
            The 4K Standard
          </h2>
          <div className='space-y-4 text-gray-300 leading-relaxed'>
            <p>
              While NexStream supports up to 8K, we recommend{' '}
              <span className='text-cyan-400 font-bold'>4K (2160p)</span> as the
              current industry standard. 4K provides near-perfect visual
              fidelity that matches the hardware limits of 95% of modern
              devices.
            </p>
            <p>
              It is the universal "Sweet Spot"—delivering breathtaking detail
              while remaining efficient enough to play smoothly on iPhones,
              Android flagships, and high-end laptops without the massive
              storage or battery drain associated with higher resolutions.
            </p>
          </div>
        </div>
      </section>

      {/* 8K Warning Section */}
      <section className='bg-amber-500/5 border border-amber-500/20 p-6 md:p-8 rounded-[2rem] flex flex-col md:flex-row gap-6 items-center'>
        <div className='bg-amber-500/20 p-4 rounded-2xl border border-amber-500/30 text-amber-400 shrink-0'>
          <AlertTriangle size={32} />
        </div>
        <div className='space-y-2 text-center md:text-left'>
          <h3 className='text-amber-400 font-bold uppercase tracking-widest text-sm'>
            8K Technical Requirements
          </h3>
          <p className='text-gray-300 text-sm leading-relaxed'>
            8K (4320p) is bleeding-edge tech. To play 8K smoothly, you need:
          </p>
          <ul className='text-[11px] text-gray-400 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 list-disc list-inside'>
            <li>RTX 30/40 Series GPUs (or equivalent)</li>
            <li>Apple M2/M3 Silicon or higher</li>
            <li>Latest Flagships (S24 Ultra / iPhone 15 Pro+)</li>
            <li>Native 8K Smart TVs or Monitors</li>
          </ul>
          <p className='text-[10px] text-amber-500/70 pt-2 italic'>
            Note: On mid-range or older devices, 8K will likely cause extreme
            lag, overheating, or only play audio.
          </p>
        </div>
      </section>

      <section className='bg-black/40 backdrop-blur-xl border border-white/10 p-8 md:p-12 rounded-[2.5rem] relative overflow-hidden'>
        <div className='absolute top-0 right-0 p-8 opacity-10'>
          <Cpu size={120} className='text-cyan-500' />
        </div>

        <div className='relative z-10 space-y-8'>
          <h2 className='text-2xl font-black text-white uppercase tracking-tighter'>
            The Extraction Engine
          </h2>
          <div className='grid md:grid-cols-2 gap-10 items-center'>
            <div className='space-y-6 text-gray-300 leading-relaxed text-base'>
              <p>
                NexStream identifies the exact{' '}
                <span className='text-white font-bold'>VP9</span> or{' '}
                <span className='text-white font-bold'>AV1</span> master
                streams. We use an elite{' '}
                <span className='text-cyan-400 font-bold'>
                  Double-Pipe Architecture
                </span>{' '}
                to mux these high-bitrate video streams with high-fidelity audio
                into a standard MP4 container in real-time.
              </p>
              <p>
                Our process ensures that even at 8K 60fps, every pixel is
                preserved exactly as it exists on the source servers, with zero
                re-encoding loss.
              </p>
            </div>
            <div className='bg-cyan-500/5 rounded-[2rem] border border-cyan-500/20 p-6 space-y-4 font-mono text-xs'>
              <div className='flex items-center gap-3 text-cyan-400'>
                <CheckCircle2 size={14} /> Resolving 8K/4K Master Streams
              </div>
              <div className='flex items-center gap-3 text-cyan-400'>
                <CheckCircle2 size={14} /> HFR (60/120fps) Detection
              </div>
              <div className='flex items-center gap-3 text-cyan-400'>
                <CheckCircle2 size={14} /> AV1/VP9 Stream Muxing
              </div>
              <div className='flex items-center gap-3 text-cyan-400'>
                <CheckCircle2 size={14} /> Dynamic Moov Atom Injection
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className='flex flex-col items-center gap-8 mt-12 pb-12'>
        <div className='text-center'>
          <p className='text-sm text-cyan-400 font-black uppercase tracking-widest'>
            True quality, no compromises.
          </p>
        </div>

        <button
          onClick={() => window.close()}
          className='flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest border border-white/10 px-10 py-4 rounded-full hover:bg-white/10 hover:border-white/20 transition-all duration-300 font-black text-gray-400'
        >
          Close Guide
        </button>
      </footer>
    </motion.div>
  );
};

export default VideoGuide;
