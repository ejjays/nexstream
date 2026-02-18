import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, ShieldCheck, Headphones, Info, ExternalLink } from 'lucide-react';

const FormatGuide = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "NexStream | Audio Format Guide";
  }, []);

  const features = [
    {
      title: "MP3 (Fast)",
      tag: "SPEED MODE",
      borderColor: "border-emerald-500",
      textColor: "text-emerald-400",
      bgColor: "bg-emerald-500",
      description: "The fastest way to download. Optimized for instant starts and universal device support.",
      points: [
        { icon: <Zap size={16} />, text: "Instant: ~0.4s startup.", bold: true },
        { icon: <ShieldCheck size={16} />, text: "Professional 192kbps CBR quality." },
        { icon: <Info size={16} />, text: "Tradeoff: Re-encoding loss.", subtle: true }
      ]
    },
    {
      title: "M4A (AAC)",
      tag: "HQ & COMPATIBILITY",
      borderColor: "border-cyan-500",
      textColor: "text-cyan-400",
      bgColor: "bg-cyan-500",
      description: "The Gold Standard. Crystal-clear audio that works on every device without losing a bit.",
      points: [
        { icon: <ShieldCheck size={16} />, text: "Lossless Direct-Stream: No re-encoding.", bold: true },
        { icon: <Headphones size={16} />, text: "Better frequency response than MP3." },
        { icon: <ShieldCheck size={16} />, text: "Perfect for iPhone, Android, & Cars." }
      ]
    },
    {
      title: "WebM (Opus)",
      tag: "STUDIO MASTER",
      borderColor: "border-amber-500",
      textColor: "text-amber-400",
      bgColor: "bg-amber-500",
      description: "The pinnacle of digital audio. Highest fidelity preserved from the master server.",
      points: [
        { icon: <Zap size={16} />, text: "Studio Grade: 160kbps Opus data.", bold: true },
        { icon: <ShieldCheck size={16} />, text: "More high-frequency detail than M4A." },
        { icon: <Info size={16} />, text: "Requires modern players (VLC, etc.)", subtle: true }
      ]
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className='w-full flex flex-col gap-10'
    >
      <header className='text-center flex flex-col items-center gap-4'>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className='w-20 h-20 bg-cyan-500/10 rounded-3xl border border-cyan-500/20 flex items-center justify-center p-4'
        >
          <img src="/logo.webp" alt="NexStream" className="w-full h-full object-contain" />
        </motion.div>
        <h1 className='text-4xl md:text-6xl font-black uppercase tracking-tighter text-white'>
          Audio <span className='text-cyan-400'>Format Guide</span>
        </h1>
        <p className='text-gray-400 max-w-xl font-medium'>
          The Science of Perfect Audio. Choose your priority: Speed or Quality.
        </p>
      </header>

      <section className='bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden group'>
        <div className='absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 blur-[80px] group-hover:bg-cyan-500/20 transition-all duration-700'></div>
        <h2 className='text-2xl font-black text-cyan-400 mb-4 flex items-center gap-3 uppercase tracking-tighter'>
          🚀 Two Engines, One App
        </h2>
        <p className='text-gray-300 leading-relaxed text-lg'>
          <span className='text-white font-bold'>NexStream</span> features a Hybrid Engine. Use our <span className='text-emerald-400 font-bold underline decoration-emerald-500/30 underline-offset-4'>Lightning Engine</span> for instant MP3s, or our <span className='text-cyan-400 font-bold underline decoration-cyan-500/30 underline-offset-4'>Direct-Stream Engine</span> for lossless M4A/WebM files that come straight from the master servers without re-encoding.
        </p>
      </section>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {features.map((feature, idx) => (
          <motion.div
            key={idx}
            whileHover={{ y: -5 }}
            className={`bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] border-l-4 ${feature.borderColor} border-t border-r border-b border-white/5 shadow-xl flex flex-col h-full`}
          >
            <div className='flex items-center justify-between mb-4'>
              <h3 className={`text-2xl font-black uppercase tracking-tight ${feature.textColor}`}>{feature.title}</h3>
              <span className={`${feature.bgColor} text-black text-[10px] font-black px-2 py-1 rounded-full`}>{feature.tag}</span>
            </div>
            <p className='text-sm text-gray-400 mb-8 font-medium leading-relaxed'>{feature.description}</p>
            <ul className='space-y-4 mt-auto'>
              {feature.points.map((point, pIdx) => (
                <li key={pIdx} className={`flex items-start gap-3 text-xs ${point.subtle ? 'text-gray-500 italic' : feature.textColor}`}>
                  <span className='shrink-0 mt-0.5 opacity-80'>{point.icon}</span>
                  <span className={`${point.bold ? 'text-white font-bold' : ''}`}>{point.text}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      <section className='bg-black/40 backdrop-blur-xl border border-cyan-500/20 p-8 rounded-[2rem] shadow-inner'>
        <div className='flex items-center gap-3 mb-6'>
          <span className='text-2xl'>🔬</span>
          <h2 className='text-xl font-black text-cyan-400 uppercase tracking-tighter'>Speed vs Quality: The Tech</h2>
        </div>
        <div className='space-y-6 text-sm text-gray-400 leading-relaxed'>
          <p>
            <span className='text-white font-bold'>MP3 (Speed Mode)</span> uses <span className='text-emerald-400 font-bold'>High-Fidelity Real-Time Transcoding</span>. We decode the source and immediately re-encode it into a professional 192kbps CBR stream. This ensures perfect duration accuracy and maximum compatibility.
          </p>
          <div className='bg-black/30 p-5 rounded-2xl border border-white/5 font-mono text-[10px] sm:text-xs text-gray-500 shadow-inner flex flex-col gap-2'>
            <div className='flex items-center gap-2'>
              <span className='text-emerald-500 font-bold'>MP3 Engine:</span> 
              <span>Source → FFmpeg Transcode → Client</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='text-cyan-500 font-bold'>M4A Engine:</span> 
              <span>Source → Header Optimization → Client</span>
            </div>
          </div>
          <p>
            <span className='text-white font-bold'>Direct-Stream Copy (M4A/WebM)</span> takes longer to initialize (~5s) because we use elite algorithms to restructure the file's "Moov Atoms" so your device can read duration and seek correctly without losing a bit of quality.
          </p>
        </div>
      </section>

      <footer className='text-center text-gray-500 text-sm flex flex-col gap-4 mt-8'>
        <div className='space-y-1'>
          <p>For instant downloads & old players, choose <span className='text-emerald-400 font-bold'>MP3</span>.</p>
          <p>For maximum quality & seeking, choose <span className='text-cyan-400 font-bold'>M4A</span> or <span className='text-amber-400 font-bold'>WebM</span>.</p>
        </div>
        <div className='mt-4 flex items-center justify-center gap-4'>
           <button 
            onClick={() => window.close()}
            className='flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest border border-white/10 px-8 py-3 rounded-full hover:bg-white/10 hover:border-white/20 transition-all duration-300 font-black text-gray-400'
           >
            Close Guide
           </button>
        </div>
      </footer>
    </motion.div>
  );
};

export default FormatGuide;
