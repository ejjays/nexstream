import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, Heart, Shield, Code, Cpu, Cloud } from 'lucide-react';
import { Link } from 'react-router-dom';

const AboutPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "NexStream | Our Mission & Technology";
  }, []);

  const values = [
    { icon: <Heart className='text-rose-400' />, title: "Privacy First", text: "We don't track your downloads. Your data is your business, period." },
    { icon: <Shield className='text-cyan-400' />, title: "Open Source Ethos", text: "Built on elite open-source technologies like yt-dlp and FFmpeg." },
    { icon: <Globe className='text-emerald-400' />, title: "Global Access", text: "Free tools for everyone, everywhere. No subscriptions, no limits." }
  ];

  const techStack = [
    { icon: <Cpu />, name: "Node.js Engine", desc: "High-performance media processing" },
    { icon: <Code />, name: "React 19 SPA", desc: "Modern, fluid user interface" },
    { icon: <Cloud />, name: "Hybrid Cloud", desc: "Optimized server-side streaming" }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className='w-full flex flex-col gap-12'
    >
      <section className='text-center space-y-4'>
        <h1 className='text-4xl md:text-6xl font-black uppercase tracking-tighter text-white'>
          More Than a <span className='text-cyan-400'>Converter</span>
        </h1>
        <p className='text-gray-400 text-lg font-medium max-w-2xl mx-auto'>
          NexStream is a high-performance media bridge designed to provide professional-grade access to global content.
        </p>
      </section>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {values.map((v, i) => (
          <div key={i} className='bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-3xl hover:bg-white/10 transition-colors'>
            <div className='mb-4'>{v.icon}</div>
            <h3 className='text-white font-bold text-lg mb-2'>{v.title}</h3>
            <p className='text-gray-400 text-sm leading-relaxed'>{v.text}</p>
          </div>
        ))}
      </div>

      <section className='bg-cyan-500/5 border border-cyan-500/20 p-8 rounded-[2.5rem] relative overflow-hidden'>
        <div className='relative z-10 space-y-4'>
          <h2 className='text-2xl font-black text-cyan-400 uppercase tracking-tighter'>The Vision</h2>
          <p className='text-gray-300 leading-relaxed'>
            We believe that the internet is a library, not a rental store. NexStream was built to solve the frustration of complex command-line tools by wrapping elite technologies in a beautiful, simple, and lightning-fast interface.
          </p>
          <p className='text-gray-300 leading-relaxed'>
            Whether you're a content creator, a music lover, or a researcher, NexStream provides the infrastructure you need to preserve the media you care about.
          </p>
        </div>
      </section>

      <section className='space-y-6'>
        <h2 className='text-center text-sm font-black text-gray-500 uppercase tracking-[0.4em]'>Powered By</h2>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
          {techStack.map((t, i) => (
            <div key={i} className='flex items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5'>
              <div className='text-cyan-500 opacity-50'>{t.icon}</div>
              <div>
                <div className='text-white text-xs font-bold'>{t.name}</div>
                <div className='text-gray-500 text-[10px]'>{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className='flex flex-col items-center gap-6 mt-4'>
        <button 
          onClick={() => window.close()}
          className='flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest border border-white/10 px-10 py-4 rounded-full hover:bg-white/10 hover:border-white/20 transition-all duration-300 font-black text-gray-400'
        >
          Close About
        </button>
        <p className='text-[10px] text-gray-600 font-mono text-center'>
          NexStream V1.0 // Engineered for Stability
        </p>
      </footer>
    </motion.div>
  );
};

export default AboutPage;
