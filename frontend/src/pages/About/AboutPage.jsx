import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, Heart, Shield, Code, Cpu, Smartphone, Zap, Coffee } from 'lucide-react';
import { Link } from 'react-router-dom';

const AboutPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "NexStream | Our Mission & Creator Story";
  }, []);

  const values = [
    { icon: <Heart className='text-rose-400' />, title: "Free for Everyone", text: "I believe quality tools should never be hidden behind paywalls or annoying ads." },
    { icon: <Shield className='text-cyan-400' />, title: "100% Original", text: "Obsessed with delivering the highest fidelity audio and video directly to your device." },
    { icon: <Globe className='text-emerald-400' />, title: "Global Access", text: "Providing the digital infrastructure for everyone to preserve the media they care about." }
  ];

  const techStack = [
    { icon: <Smartphone />, name: "Mobile Engineered", desc: "Built entirely on Termux & Acode" },
    { icon: <Cpu />, name: "Performance First", desc: "High-speed streaming pipelines" },
    { icon: <Zap />, name: "AI Query Architect", desc: "Multi-model metadata resolution" }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className='w-full flex flex-col gap-12'
    >
      <section className='text-center space-y-4'>
        <div className='inline-flex items-center gap-2 px-4 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4'>
          <Smartphone size={12} /> Hand-coded on Android
        </div>
        <h1 className='text-4xl md:text-6xl font-black uppercase tracking-tighter text-white'>
          The Story of <span className='text-cyan-400'>NexStream</span>
        </h1>
        <p className='text-gray-400 text-lg font-medium max-w-2xl mx-auto'>
          A high-performance media bridge built from passion, persistence, and a single mobile phone.
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

      <section className='bg-gradient-to-br from-cyan-500/10 to-purple-500/5 border border-white/10 p-8 md:p-12 rounded-[2.5rem] relative overflow-hidden group'>
        <div className='absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/10 blur-[100px] group-hover:bg-cyan-500/20 transition-all duration-700'></div>
        
        <div className='relative z-10 grid md:grid-cols-5 gap-8 items-start'>
          <div className='md:col-span-3 space-y-6'>
            <h2 className='text-3xl font-black text-white uppercase tracking-tighter'>
              Hi, I'm <span className='text-cyan-400'>EJ! 👋</span>
            </h2>
            <div className='space-y-4 text-gray-300 leading-relaxed text-base'>
              <p>
                I built NexStream with one clear goal: <span className='text-white font-bold underline decoration-cyan-500/30 underline-offset-4'>to make high-quality tools completely free for everyone</span>. I believe everyone deserves access to great media tools without being hidden behind paywalls or cluttered with annoying ads.
              </p>
              <p>
                To be honest, I built this entire application using only my mobile phone through Termux and Acode, as I don't have a computer yet. 
              </p>
              <p>
                It has been a challenge, but I am very passionate about making this work for you. Helping others is what keeps me going.
              </p>
            </div>
          </div>
          
          <div className='md:col-span-2 space-y-6 bg-black/20 backdrop-blur-md border border-white/5 p-6 rounded-[2rem]'>
            <h3 className='text-xs font-black text-cyan-400 uppercase tracking-widest'>Support the Journey</h3>
            <p className='text-xs text-gray-400 leading-relaxed'>
              Your support helps me keep the servers running and allows me to stay focused on developing the next generation of open-source media tools.
            </p>
            <a 
              href="https://www.buymeacoffee.com/ejjays" 
              target="_blank" 
              rel="noopener noreferrer"
              className='flex items-center justify-center gap-3 w-full bg-[#FFDD00] text-black font-black uppercase text-xs py-4 rounded-2xl hover:scale-[1.02] transition-transform'
            >
              <Coffee size={18} /> Buy me a coffee
            </a>
          </div>
        </div>
      </section>

      <section className='space-y-6'>
        <h2 className='text-center text-sm font-black text-gray-500 uppercase tracking-[0.4em]'>Engineered Stability</h2>
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
          {techStack.map((t, i) => (
            <div key={i} className='flex items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5 group hover:border-cyan-500/30 transition-colors'>
              <div className='text-cyan-500 opacity-50 group-hover:opacity-100 transition-opacity'>{t.icon}</div>
              <div>
                <div className='text-white text-xs font-bold'>{t.name}</div>
                <div className='text-gray-500 text-[10px]'>{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className='flex flex-col items-center gap-8 mt-12 pb-12'>
        <div className='text-center'>
          <p className='text-sm text-cyan-400 font-black uppercase tracking-widest'>
            God bless & thank you for being part of this journey.
          </p>
        </div>
        
        <button 
          onClick={() => window.close()}
          className='flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest border border-white/10 px-10 py-4 rounded-full hover:bg-white/10 hover:border-white/20 transition-all duration-300 font-black text-gray-400'
        >
          Close About
        </button>
      </footer>
    </motion.div>
  );
};

export default AboutPage;
