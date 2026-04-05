import { DEMO_SONGS } from '../../components/remix/DemoSongsConfig.js';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import MixerControls from '../../components/remix/MixerControls.jsx';
import PlayerControls from '../../components/remix/PlayerControls.jsx';
import MetronomeSheet from '../../components/remix/MetronomeSheet.jsx';
import LyricsSheet from "../../components/remix/LyricsSheet.jsx";
import UploadScreen from '../../components/remix/UploadScreen.jsx';
import ChordDisplay from '../../components/remix/ChordDisplay.jsx';
import SEO from '../../components/utils/SEO.jsx';
import ErudaLoader from '../../components/utils/ErudaLoader.jsx';
import { RemixProvider, useRemixContext } from '../../context/RemixContext';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const getBackendUrl = () => {
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
      return `${protocol}//${hostname}:5000`;
    }
  }
  return BACKEND_URL;
};

const RemixLabContent = ({ onExit }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    stems, setStems, chords, setChords, beats, setBeats,
    tempo, setTempo, songName, setSongName, gridShift,
    isPlaying, duration, currentTime, isReady, currentBeatIdx, beatFlash,
    loadAudioSources, stopAll, togglePlay, handleSeek, volumes,
    handleVolumeChange, handleVolumeCommit, resetProject
  } = useRemixContext();

  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('remix_lab_api_url') || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [stemMode, setStemMode] = useState('4 Stems');
  const [engineMode, setEngineMode] = useState('Demucs (Fast / Balanced)');
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showLyricsSheet, setShowLyricsSheet] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const lastLoadedProjectRef = useRef(null);

  const handleApiUrlChange = async url => {
    setApiUrl(url);
    localStorage.setItem('remix_lab_api_url', url);
    if (url && url.startsWith('http')) {
      try {
        await fetch(`${getBackendUrl()}/api/remix/register-engine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (apiUrl) handleApiUrlChange(apiUrl);
  }, []);

  useEffect(() => {
    const handleKeyDown = e => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); handleSeek(Math.max(0, currentTime - 5)); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); handleSeek(Math.min(duration, currentTime + 5)); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isReady, currentTime, duration, togglePlay, handleSeek]);

  useEffect(() => {
    fetchHistory();
    return () => stopAll();
  }, [stopAll]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const projectId = params.get('project');
    if (!projectId) {
      if (lastLoadedProjectRef.current !== null) {
        lastLoadedProjectRef.current = null;
        resetProject();
      }
      setIsInitializing(false);
      return;
    }
    if (projectId && lastLoadedProjectRef.current !== projectId) {
      const demo = DEMO_SONGS?.find(d => d.id === projectId);
      if (demo) {
        lastLoadedProjectRef.current = projectId;
        fetch(demo.chordsPath).then(res => res.json()).then(data => {
          setSongName(demo.name);
          setStems(demo.stems);
          setChords(data.chords || []);
          setBeats(data.beats || []);
          setTempo(data.tempo || 0);
          loadAudioSources(demo.stems);
          setIsInitializing(false);
        }).catch(() => setIsInitializing(false));
        return;
      }
      if (history.length > 0) {
        const project = history.find(p => p.id === projectId);
        if (project) {
          lastLoadedProjectRef.current = projectId;
          setSongName(project.name);
          setStems(project.stems);
          setChords(project.chords || []);
          setBeats(project.beats || []);
          setTempo(project.tempo || 0);
          loadAudioSources(project.stems);
        }
        setIsInitializing(false);
      }
    } else if (projectId && stems) {
      setIsInitializing(false);
    }
  }, [location.search, history, loadAudioSources, stems, resetProject]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/remix/history`);
      const data = await res.json();
      const formatted = data.map(item => {
        const fullStems = {};
        Object.keys(item.stems).forEach(k => {
          fullStems[k] = `${getBackendUrl()}${item.stems[k]}`;
        });
        return { ...item, stems: fullStems };
      });
      setHistory(formatted);
    } catch (err) {}
  };

  const handleUpload = async e => {
    const selectedFile = e.target.files[0];
    if (!selectedFile || !apiUrl) return;
    setSongName(selectedFile.name.replace(/\.[^/.]+$/, ''));
    resetProject();
    setIsProcessing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('engine', engineMode);
      formData.append('stems', stemMode);
      const response = await fetch(`${getBackendUrl()}/api/remix/process`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error(`bridge error: ${response.status}`);
      const data = await response.json();
      if (data.status === 'error') throw new Error(data.message);
      const { metadata, stems: rawStems } = data;
      const saveRes = await fetch(`${getBackendUrl()}/api/remix/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `${Date.now()}-lab`,
          name: songName,
          stems: rawStems,
          chords: metadata.chords,
          beats: metadata.beats,
          tempo: metadata.tempo,
          engine: engineMode.includes('Demucs') ? 'Demucs' : 'RoFormer'
        })
      });
      const { localStems } = await saveRes.json();
      const finalStems = {};
      Object.keys(localStems).forEach(k => {
        finalStems[k] = `${getBackendUrl()}${localStems[k]}`;
      });
      setStems(finalStems);
      setChords(metadata.chords);
      setBeats(metadata.beats);
      setTempo(metadata.tempo);
      loadAudioSources(finalStems);
      fetchHistory();
    } catch (err) {
      console.error('nitro error:', err);
      setError('Engine connection failed.');
      setIsProcessing(false);
    }
  };

  if (isInitializing) return <div className='fixed inset-0 bg-[#000000] z-[100]'></div>;

  return (
    <div className='fixed inset-0 bg-[#000000] text-white flex flex-col z-[100] font-sans overflow-hidden'>
      <SEO title='Remix Lab' description='Stem separation and chord analysis.' />
      <ErudaLoader />
      {stems && (
        <header className='flex items-center justify-between p-4 px-6 shrink-0 relative'>
          <button onClick={() => navigate('/tools/remix-lab')} className='active:scale-90 flex items-center gap-2 text-zinc-400 hover:text-white'>
            <ChevronDown size={28} className='rotate-90' />
            <span className='text-sm font-medium hidden sm:block'>Back to Library</span>
          </button>
          <h1 className='text-lg font-bold truncate max-w-[50%] absolute left-1/2 -translate-x-1/2'>{songName}</h1>
        </header>
      )}
      <main className='flex-1 flex flex-col items-center min-h-0 overflow-hidden relative'>
        {!stems ? (
          <UploadScreen
            isProcessing={isProcessing}
            stemMode={stemMode} setStemMode={setStemMode}
            engineMode={engineMode} setEngineMode={setEngineMode}
            apiUrl={apiUrl} setApiUrl={handleApiUrlChange}
            handleUpload={handleUpload}
            history={history}
            onSelectHistory={item => navigate(`/tools/remix-lab?project=${item.id}`)}
            onExit={onExit}
          />
        ) : (
          <div className='flex-1 w-full flex flex-col items-center justify-between min-h-0 overflow-hidden'>
            <ChordDisplay
              chords={chords} beats={beats}
              currentTime={currentTime} currentBeatIdx={currentBeatIdx}
              gridShift={gridShift} beatFlash={beatFlash}
            />
            <div className='w-full flex-1 flex justify-center px-4 py-4 overflow-y-auto scrollbar-none'>
              <MixerControls />
            </div>
            <PlayerControls setShowLyricsSheet={setShowLyricsSheet} />
          </div>
        )}
      </main>
      <LyricsSheet showLyricsSheet={showLyricsSheet} setShowLyricsSheet={setShowLyricsSheet} projectId={lastLoadedProjectRef.current} getBackendUrl={getBackendUrl} />
      <MetronomeSheet />
    </div>
  );
};

const RemixLab = (props) => (
  <RemixProvider>
    <RemixLabContent {...props} />
  </RemixProvider>
);

export default RemixLab;
