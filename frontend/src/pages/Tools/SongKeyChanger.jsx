import { useState, useRef } from 'react';
import { BACKEND_URL } from '../../lib/config';
import {
  UploadCloud,
  Music,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Play,
  Pause,
  Download,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DotPattern from '../../components/ui/DotPattern';
import ShootingStars from '../../components/ui/ShootingStars';

const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const normalizeKey = key => {
  const map = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
  return map[key] || key;
};

const keyMap = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };

const SongKeyChanger = () => {
  const [file, setFile] = useState(null);
  const [originalKey, setOriginalKey] = useState('C');
  const [targetKey, setTargetKey] = useState('G');
  const [status, setStatus] = useState('idle');
  const [detectedInfo, setDetectedInfo] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);

  const fileInputRef = useRef(null);
  const resultAudioRef = useRef(null);

  const getSemitoneDiff = () => {
    const diff = (keyMap[targetKey] - keyMap[originalKey] + 12) % 12;
    return diff > 6 ? diff - 12 : diff;
  };

  const semitones = getSemitoneDiff();

  const togglePlayback = () => {
    if (resultAudioRef.current) {
      if (isPlaying) resultAudioRef.current.pause();
      else resultAudioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (resultAudioRef.current) {
      setAudioProgress(
        (resultAudioRef.current.currentTime / resultAudioRef.current.duration) *
          100
      );
    }
  };

  const analyzeFile = async selectedFile => {
    setStatus('analyzing');
    setError(null);
    const formData = new FormData();
    formData.append('song', selectedFile);

    try {
      const response = await fetch(`${BACKEND_URL}/api/key-changer/detect`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');

      const normalized = normalizeKey(data.key);
      setOriginalKey(normalized);
      setDetectedInfo({
        key: `${data.key} ${data.scale}`,
        chords: data.chords || []
      });
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const handleFileChange = e => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setDownloadUrl(null);
      analyzeFile(selectedFile);
    }
  };

  const startConversion = async () => {
    setStatus('processing');
    const formData = new FormData();
    formData.append('song', file);
    formData.append('originalKey', originalKey);
    formData.append('targetKey', targetKey);

    try {
      const response = await fetch(`${BACKEND_URL}/api/key-changer/convert`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Conversion failed');
      setDownloadUrl(
        `${BACKEND_URL}/api/key-changer/download/${data.filename}`
      );
      setStatus('completed');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const reset = () => {
    setFile(null);
    setStatus('idle');
    setDownloadUrl(null);
    setDetectedInfo(null);
    setError(null);
  };

  return (
    <div className='flex flex-col min-h-screen w-full relative overflow-hidden text-slate-200 font-sans selection:bg-cyan-500/30'>
      <DotPattern />
      <ShootingStars starColor='#22d3ee' />

      <div className='fixed rounded-full blur-[120px] -z-10 opacity-20 animate-float w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-purple-900 -top-12 -left-12 sm:-top-24 sm:-left-24 pointer-events-none'></div>
      <div
        className='fixed rounded-full blur-[120px] -z-10 opacity-20 animate-float w-[350px] h-[350px] sm:w-[600px] sm:h-[600px] bg-blue-950 -bottom-20 -right-20 sm:-bottom-36 sm:-right-36 pointer-events-none'
        style={{ animationDelay: '-5s' }}
      ></div>

      <main className='container mx-auto px-6 py-20 max-w-4xl relative z-10 flex flex-col justify-center grow'>
        <header className='text-center mb-16'>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className='inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold tracking-widest uppercase mb-6'
          >
            <Music size={14} /> For Musicians
          </motion.div>
          <h1 className='text-5xl md:text-7xl font-black tracking-tighter text-white mb-4'>
            Song<span className='text-cyan-400 text-glow'>Key</span>
          </h1>
          <p className='text-slate-400 text-lg max-w-xl mx-auto font-medium'>
            Detect or transpose your tracks into any key
          </p>
        </header>

        <div className='space-y-8'>
          {status === 'idle' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => fileInputRef.current?.click()}
              className='group relative border-2 border-dashed border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/50 rounded-[2rem] p-16 transition-all cursor-pointer overflow-hidden backdrop-blur-md'
            >
              <input
                type='file'
                ref={fileInputRef}
                className='hidden'
                accept='audio/*'
                onChange={handleFileChange}
              />
              <div className='relative z-10 flex flex-col items-center text-center'>
                <div className='w-20 h-20 rounded-3xl bg-slate-800/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-cyan-500 transition-all duration-500 border border-white/5'>
                  <UploadCloud
                    size={32}
                    className='text-slate-400 group-hover:text-slate-950'
                  />
                </div>
                <h3 className='text-2xl font-bold text-white mb-2'>
                  Drop your track here
                </h3>
                <p className='text-slate-500 font-medium'>
                  mp3, m4a, wav ...• Up to 100MB
                </p>
              </div>
            </motion.div>
          )}

          {(status === 'analyzing' || status === 'processing') && (
            <div className='bg-[#030014]/40 backdrop-blur-xl border border-white/10 rounded-[2rem] p-20 text-center space-y-8'>
              <div className='relative inline-block'>
                <Loader2 size={64} className='text-cyan-500 animate-spin' />
                <div className='absolute inset-0 blur-2xl bg-cyan-500/20 animate-pulse' />
              </div>
              <div className='space-y-2'>
                <h3 className='text-2xl font-bold text-white uppercase tracking-tighter'>
                  {status === 'analyzing'
                    ? 'Analyzing Harmonic Content'
                    : 'Processing Bitstream'}
                </h3>
                <p className='text-cyan-500/60 font-mono text-sm animate-pulse italic'>
                  {status === 'analyzing'
                    ? 'Extracting fundamental frequency...'
                    : 'Applying RubberBand pitch scaling...'}
                </p>
              </div>
            </div>
          )}

          {status === 'ready' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className='w-full'
            >
              <div className='bg-[#030014]/60 border border-white/10 rounded-[2.5rem] p-1 shadow-2xl backdrop-blur-2xl overflow-hidden'>
                <div className='bg-gradient-to-b from-white/[0.08] to-transparent rounded-[2.4rem] p-8'>
                  <div className='flex items-center justify-between mb-12'>
                    <div className='flex items-center gap-5'>
                      <div className='w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.15)]'>
                        <Music size={28} />
                      </div>
                      <div className='min-w-0'>
                        <h4 className='font-bold text-white truncate max-w-[200px] sm:max-w-[300px] text-lg'>
                          {file?.name}
                        </h4>
                        <div className='flex items-center gap-2 mt-1'>
                          <span className='px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase tracking-wider border border-cyan-500/20'>
                            AI Detected
                          </span>
                          <span className='text-slate-400 text-sm font-bold'>
                            {detectedInfo?.key}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={reset}
                      className='p-3 hover:bg-white/5 rounded-2xl text-slate-500 transition-all hover:text-white border border-transparent hover:border-white/10'
                    >
                      <XCircle size={24} />
                    </button>
                  </div>

                  <div className='relative grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] items-center gap-6 mb-12'>
                    <div className='space-y-4'>
                      <label className='text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] ml-2'>
                        Source Key
                      </label>
                      <div className='relative group'>
                        <select
                          className='w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 font-black text-2xl text-white appearance-none cursor-pointer focus:border-cyan-500/50 outline-none transition-all hover:bg-white/[0.08]'
                          value={originalKey}
                          onChange={e => setOriginalKey(e.target.value)}
                        >
                          {keys.map(k => (
                            <option
                              key={k}
                              value={k}
                              className='bg-[#030014] text-cyan-400 font-sans'
                            >
                              {k}
                            </option>
                          ))}
                        </select>
                        <div className='absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 group-hover:text-cyan-400 transition-colors'>
                          <RefreshCw size={18} />
                        </div>
                      </div>
                    </div>

                    <div className='flex flex-col items-center gap-2 py-4'>
                      <div className='w-12 h-12 rounded-full bg-cyan-500 flex items-center justify-center text-slate-950 shadow-[0_0_30px_rgba(6,182,212,0.4)] z-10'>
                        <ArrowRight size={24} strokeWidth={3} />
                      </div>
                      <div className='px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20'>
                        <span className='text-xs font-black text-cyan-400 font-mono'>
                          {semitones > 0 ? `+${semitones}` : semitones} ST
                        </span>
                      </div>
                    </div>

                    <div className='space-y-4'>
                      <label className='text-[10px] font-black text-cyan-500 uppercase tracking-[0.25em] ml-2'>
                        Target Key
                      </label>
                      <div className='relative group'>
                        <select
                          className='w-full bg-cyan-500/10 border border-cyan-500/30 rounded-2xl px-6 py-5 font-black text-2xl text-cyan-400 appearance-none cursor-pointer focus:border-cyan-500 outline-none transition-all hover:bg-cyan-500/20 shadow-[0_0_40px_rgba(6,182,212,0.1)]'
                          value={targetKey}
                          onChange={e => setTargetKey(e.target.value)}
                        >
                          {keys.map(k => (
                            <option
                              key={k}
                              value={k}
                              className='bg-[#030014] text-cyan-400 font-sans'
                            >
                              {k}
                            </option>
                          ))}
                        </select>
                        <div className='absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-cyan-500'>
                          <Music size={18} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={startConversion}
                    className='w-full py-6 rounded-2xl bg-white text-slate-950 font-black text-xl tracking-tighter hover:scale-[1.01] active:scale-[0.99] transition-all shadow-[0_20px_50px_-10px_rgba(255,255,255,0.3)] flex items-center justify-center gap-3 group'
                  >
                    <span>Process Audio</span>
                    <ArrowRight
                      size={20}
                      className='group-hover:translate-x-1 transition-transform'
                    />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {status === 'completed' && downloadUrl && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className='bg-[#030014]/60 border border-cyan-500/30 rounded-[2.5rem] p-10 shadow-2xl overflow-hidden relative backdrop-blur-xl'
            >
              <div className='absolute top-0 right-0 p-8'>
                <CheckCircle2 size={32} className='text-cyan-500 opacity-20' />
              </div>

              <div className='flex flex-col md:flex-row items-center gap-10'>
                <div className='relative group'>
                  <div className='w-40 h-40 rounded-[2.5rem] bg-[#030014]/80 flex items-center justify-center overflow-hidden border border-white/5 relative shadow-2xl'>
                    <Music size={48} className='text-slate-700' />
                    <button
                      onClick={togglePlayback}
                      className='absolute inset-0 bg-cyan-500/90 text-slate-950 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 scale-90 group-hover:scale-100'
                    >
                      {isPlaying ? (
                        <Pause size={40} fill='currentColor' />
                      ) : (
                        <Play size={40} fill='currentColor' className='ml-2' />
                      )}
                    </button>
                  </div>
                </div>

                <div className='flex-1 w-full text-center md:text-left'>
                  <div className='inline-block px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase tracking-widest mb-4'>
                    Master Rendered
                  </div>
                  <h3 className='text-3xl font-black text-white mb-2 truncate max-w-sm'>
                    {file?.name}
                  </h3>
                  <div className='flex items-center justify-center md:justify-start gap-4 text-slate-400 font-bold mb-8'>
                    <span>{originalKey}</span>
                    <ArrowRight size={14} />
                    <span className='text-cyan-400'>{targetKey}</span>
                  </div>

                  <div className='space-y-4'>
                    <div className='h-2 w-full bg-white/5 rounded-full overflow-hidden'>
                      <motion.div
                        className='h-full bg-cyan-500'
                        style={{ width: `${audioProgress}%` }}
                      />
                    </div>
                    <div className='flex gap-4'>
                      <a
                        href={downloadUrl}
                        download
                        className='flex-1 py-4 bg-white text-slate-950 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors'
                      >
                        <Download size={18} /> Download
                      </a>
                      <button
                        onClick={reset}
                        className='p-4 bg-white/5 text-white rounded-2xl hover:bg-white/10 transition-colors border border-white/10'
                      >
                        <RefreshCw size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <audio
                ref={resultAudioRef}
                src={downloadUrl}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                className='hidden'
              />
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className='p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-center font-bold backdrop-blur-md'
            >
              {error}
              <button
                onClick={reset}
                className='block mx-auto mt-4 text-xs underline uppercase tracking-widest opacity-60'
              >
                Try again
              </button>
            </motion.div>
          )}
        </div>
      </main>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .text-glow {
          text-shadow: 0 0 30px rgba(34, 211, 238, 0.5);
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `
        }}
      />
    </div>
  );
};

export default SongKeyChanger;
