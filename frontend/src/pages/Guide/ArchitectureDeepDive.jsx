import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Cpu, 
  Zap, 
  Database, 
  Network, 
  ShieldCheck, 
  Search, 
  Layers, 
  ChevronRight,
  Info,
  Activity,
  Smartphone,
  Shield
} from 'lucide-react';
import { GlassCard } from '../../components/ui/GlassCard';
import SEO from '../../components/utils/SEO';

const ArchitectureDeepDive = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const coreSystems = [
    {
      title: "Quantum Race",
      tag: "SEARCH ORCHESTRATOR",
      icon: <Search size={20} />,
      textColor: "text-cyan-400",
      bgColor: "bg-cyan-500",
      description: "Solves the 'wrong song' problem. Executes a staggered multi-engine race using ISRC and AI vectors.",
      points: [
        { text: "Staggered search: ISRC → Semantic → AI.", bold: true },
        { text: "Drift rejection: < 8s duration variance." },
        { text: "Authoritative mapping via Soundcharts." }
      ]
    },
    {
      title: "The Pulse",
      tag: "REAL-TIME SSE",
      icon: <Activity size={20} />,
      textColor: "text-amber-400",
      bgColor: "bg-amber-500",
      description: "Eliminates the 'black box' feel. Every backend micro-decision is streamed to the UI in real-time.",
      points: [
        { text: "Granular logging: Handshake → Mapped → Pipe.", bold: true },
        { text: "Zero-latency progress interpolation." },
        { text: "Bidirectional status heartbeat." }
      ]
    },
    {
      title: "Shadow Stream",
      tag: "RAM-ONLY ENGINE",
      icon: <Shield size={20} />,
      textColor: "text-emerald-400",
      bgColor: "bg-emerald-500",
      description: "Proprietary FFmpeg piping strategy that prioritizes privacy and speed above all else.",
      points: [
        { text: "Pure memory pipe: 0% disk footprint.", bold: true },
        { text: "Instant header flushing (0ms trigger)." },
        { text: "Real-time transcoding to 192kbps CBR." }
      ]
    },
    {
      title: "Super Brain",
      tag: "GLOBAL REGISTRY",
      icon: <Database size={20} />,
      textColor: "text-purple-400",
      bgColor: "bg-purple-500",
      description: "A collaborative memory layer. Once a track is verified, it becomes instant for all users globally.",
      points: [
        { text: "Turso-powered persistent indexing.", bold: true },
        { text: "Instant metadata hydration (0.1s)." },
        { text: "Automatic 'healing' for broken links." }
      ]
    }
  ];

  return (
    <div className='w-full flex flex-col gap-10 pb-12'>
      <SEO 
        title="Technical Architecture | Beyond the Wrapper"
        description="Engineering nexstream: A deep dive into the 'Quantum Race' search engine, 'Super Brain' global registry, and 'Shadow Stream' RAM-only delivery pipeline."
        canonicalUrl="/resources/architecture"
      />
      <header className='text-center flex flex-col items-center gap-4'>
        <div className='inline-flex items-center gap-2 px-4 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4'>
          <Cpu size={12} /> Technical Architecture
        </div>
        <h1 className='text-4xl md:text-6xl font-black uppercase tracking-tighter text-white'>
          Beyond the <span className='text-cyan-400'>Wrapper</span>
        </h1>
        <p className='text-gray-400 max-w-xl font-medium'>
          Engineering nexstream: How we solve the complexities of modern media orchestration.
        </p>
      </header>

      <section className='bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden group'>
        <div className='absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 blur-[80px] group-hover:bg-cyan-500/20 transition-all duration-700'></div>
        <h2 className='text-2xl font-black text-cyan-400 mb-4 flex items-center gap-3 uppercase tracking-tighter'>
          🚀 The Orchestration Layer
        </h2>
        <p className='text-gray-300 leading-relaxed text-lg font-medium'>
          NexStream isn't just a UI; it's a <span className='text-white font-bold'>high-concurrency media orchestrator</span>. We solve the edge cases that break simple tools—like TikTok's fragmented muxing, Spotify's metadata drift, and slow server-side re-encoding through a custom-built delivery pipeline.
        </p>
      </section>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        {coreSystems.map((system, idx) => (
          <GlassCard key={idx} className="group relative overflow-hidden">
            <div className={`absolute inset-y-0 left-0 w-1 ${system.bgColor} opacity-40 blur-[0.5px] group-hover:opacity-100 group-hover:w-1.5 transition-all duration-500`} />
            
            <div className='p-8 flex flex-col h-full'>
              <div className='flex flex-col items-start gap-3 mb-6'>
                <h3 className={`text-xl font-black uppercase tracking-tight ${system.textColor}`}>
                  {system.title}
                </h3>
                <span className={`${system.bgColor} text-black text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest`}>
                  {system.tag}
                </span>
              </div>
              <p className='text-sm text-gray-400 mb-8 font-medium leading-relaxed'>
                {system.description}
              </p>
              <ul className='space-y-4 mt-auto'>
                {system.points.map((point, pIdx) => (
                  <li key={pIdx} className={`flex items-start gap-3 text-xs ${system.textColor}`}>
                    <span className='shrink-0 mt-0.5 opacity-80'>
                      <ChevronRight size={14} />
                    </span>
                    <span className={`${point.bold ? 'text-white font-bold' : 'opacity-80'}`}>
                      {point.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </GlassCard>
        ))}
      </div>

      <section className='bg-black/40 backdrop-blur-xl border border-cyan-500/20 p-8 rounded-[2rem] shadow-inner relative overflow-hidden'>
        <div className='flex items-center gap-3 mb-6'>
          <span className='text-2xl'>🔬</span>
          <h2 className='text-xl font-black text-cyan-400 uppercase tracking-tighter'>
            Resilient Muxing Engine
          </h2>
        </div>
        <div className='space-y-6 text-sm text-gray-400 leading-relaxed'>
          <p>
            Handling platforms like <span className='text-white font-bold'>TikTok</span>, <span className='text-white font-bold'>Instagram</span>, and <span className='text-white font-bold'>Reddit</span> requires a <span className='text-amber-400 font-bold'>Header Spoofing & Double-Pipe Strategy</span>. While other tools fail with 403 Forbidden errors or fragmented audio/video, nexstream captures fragments in memory and re-muxes them into a seekable MP4 on-the-fly.
          </p>
          
          <div className='bg-black/30 p-5 rounded-2xl border border-white/5 font-mono text-[10px] sm:text-xs text-gray-500 shadow-inner flex flex-col gap-2'>
            <div className='flex items-center gap-2'>
              <span className='text-cyan-500 font-bold'>STEP 01:</span>
              <span>Bypass Restrictions via Custom User-Agent Spoofing</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='text-purple-500 font-bold'>STEP 02:</span>
              <span>Parallel Pipe capture via FFmpeg (Pipe:0)</span>
            </div>
            <div className='flex items-center gap-2'>
              <span className='text-emerald-500 font-bold'>STEP 03:</span>
              <span>Virtual Container Muxing (Frag-Keyframe)</span>
            </div>
          </div>
          
          <p className='italic text-gray-500 text-xs flex items-center gap-2'>
            <Info size={12} /> This approach ensures 100% video-audio sync without using a single byte of temporary disk space.
          </p>
        </div>
      </section>

      <section className='grid grid-cols-1 md:grid-cols-2 gap-8'>
        <div className='bg-white/5 p-8 rounded-[2rem] border border-white/10'>
          <div className='flex items-center gap-3 mb-4'>
            <Smartphone className='text-cyan-400' size={24} />
            <h2 className='text-xl font-black text-white uppercase tracking-tighter'>Universal Media Core</h2>
          </div>
          <p className='text-sm text-gray-400 leading-relaxed'>
            NexStream is engineered for platform-agnostic delivery. While currently optimized for the <span className='text-white'>Web PWA</span> and <span className='text-white'>Desktop Interface</span>, our architecture includes a dedicated bridge for <span className='text-white font-bold italic'>upcoming native mobile expansion</span>.
          </p>
        </div>
        <div className='bg-white/5 p-8 rounded-[2rem] border border-white/10'>
          <div className='flex items-center gap-3 mb-4'>
            <ShieldCheck className='text-emerald-400' size={24} />
            <h2 className='text-xl font-black text-white uppercase tracking-tighter'>Privacy by Design</h2>
          </div>
          <p className='text-sm text-gray-400 leading-relaxed'>
            Because our pipeline is <span className='text-white'>RAM-only</span>, your media never touches our server's hard drive. It exists as a volatile stream of bytes that vanishes the moment your download is complete.
          </p>
        </div>
      </section>

      <footer className='flex flex-col items-center gap-8 mt-12'>
        <div className='space-y-4 text-center'>
          <p className='text-sm text-cyan-400 font-black uppercase tracking-widest pt-4 border-t border-white/5'>
            Open Web. High Fidelity. No Compromises.
          </p>
        </div>

        <button
          onClick={() => window.history.back()}
          className='flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest border border-white/10 px-8 py-3 rounded-full hover:bg-white/10 hover:border-white/20 transition-all duration-300 font-black text-gray-400'
        >
          Return to Guide
        </button>
      </footer>
    </div>
  );
};

export default ArchitectureDeepDive;

