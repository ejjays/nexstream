import { DEMO_SONGS } from '../../components/remix/DemoSongsConfig';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import MixerControls from '../../components/remix/MixerControls';
import PlayerControls from '../../components/remix/PlayerControls';
import MetronomeSheet from '../../components/remix/MetronomeSheet';
import LyricsSheet from "../../components/remix/LyricsSheet";
import UploadScreen from '../../components/remix/UploadScreen';
import ChordDisplay from '../../components/remix/ChordDisplay';
import SEO from '../../components/utils/SEO';
import ErudaLoader from '../../components/utils/ErudaLoader';
import { RemixProvider, useRemixContext, Chord } from '../../context/RemixContext';
import { useRemixStore } from '../../store/useRemixStore';

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

interface RemixProject {
  id: string;
  name: string;
  stems: Record<string, string>;
  chords: Chord[];
  beats: number[];
  tempo: number;
  engine: string;
  date: string;
}

const RemixLabContent = ({ onExit }: { onExit: () => void }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    stems, setStems, chords, setChords, beats, setBeats,
    setTempo, songName, setSongName, gridShift,
    loadAudioSources, stopAll, togglePlay, handleSeek,
    resetProject, resumeAudioContext
  } = useRemixContext();

  const duration = useRemixStore(state => state.duration);
  const currentTime = useRemixStore(state => state.currentTime);

  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('remix_lab_api_url') || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [stemMode, setStemMode] = useState('4 Stems');
  const [engineMode, setEngineMode] = useState('Demucs (Fast / Balanced)');
  const [history, setHistory] = useState<RemixProject[]>([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [showLyricsSheet, setShowLyricsSheet] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const lastLoadedProjectRef = useRef<string | null>(null);
  const timeRef = useRef({ currentTime, duration });
  useEffect(() => {
    timeRef.current = { currentTime, duration };
  }, [currentTime, duration]);

  const handleApiUrlChange = useCallback((url: string) => {
    setApiUrl(url);
    localStorage.setItem('remix_lab_api_url', url);
  }, []);

  useEffect(() => {
    if (apiUrl?.startsWith('http')) {
      fetch(`${getBackendUrl()}/api/remix/register-engine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: apiUrl })
      }).catch(() => {
        // ignore register error
      });
    }
  }, [apiUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
      if (e.code === 'Space') { 
        e.preventDefault(); 
        resumeAudioContext();
        togglePlay(); 
      }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); handleSeek(Math.max(0, timeRef.current.currentTime - 5)); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); handleSeek(Math.min(timeRef.current.duration, timeRef.current.currentTime + 5)); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, handleSeek, resumeAudioContext]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/remix/history`);
      const data = await res.json();
      const formatted = data.map((item: RemixProject) => {
        const fullStems: Record<string, string> = {};
        Object.keys(item.stems).forEach(k => {
          fullStems[k] = `${getBackendUrl()}${item.stems[k]}`;
        });
        return { ...item, stems: fullStems };
      });
      setHistory(formatted);
    } catch (_err) {
      // ignore history fetch error
    } finally {
      setIsHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const projectId = params.get('project');
    if (!projectId) {
      if (lastLoadedProjectRef.current !== null) {
        lastLoadedProjectRef.current = null;
        resetProject();
      }
      return;
    }
    if (projectId && lastLoadedProjectRef.current !== projectId) {
      const demo = DEMO_SONGS?.find(d => d.id === projectId);
      if (demo) {
        lastLoadedProjectRef.current = projectId;
        fetch(demo.chordsPath).then(res => res.json()).then(data => {
          setSongName(demo.name);
          setStems(demo.stems);
          const demoChords: Chord[] = (data.chords || []).map((c: string | Chord) => 
            typeof c === 'string' ? { time: 0, chord: c } : c
          );
          setChords(demoChords);
          setBeats(data.beats || []);
          setTempo(data.tempo || 0);
          loadAudioSources(demo.stems);
        }).catch((err) => {
          console.error('[RemixLab] Failed to load demo chords:', err);
          setChords([]);
          setBeats([]);
          setTempo(0);
        });
        return;
      }
      if (history.length > 0) {
        const project = history.find((p) => p.id === projectId);
        if (project) {
          lastLoadedProjectRef.current = projectId;
          setSongName(project.name);
          setStems(project.stems);
          setChords(project.chords || []);
          setBeats(project.beats || []);
          setTempo(project.tempo || 0);
          loadAudioSources(project.stems);
        }
      }
    }
  }, [location.search, history]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const projectId = params.get('project');
    
    if (!projectId || stems) {
      setIsInitializing(false);
      return;
    }

    // validate project
    const isDemo = DEMO_SONGS?.some(d => d.id === projectId);
    const projectNotInHistory = isHistoryLoaded && !history.some(p => p.id === projectId);
    
    if (!isDemo && projectNotInHistory) {
      console.error("Project not found in library.");
      setIsInitializing(false);
      navigate('/tools/remix-lab', { replace: true });
    }
  }, [location.search, stems, history, isHistoryLoaded, navigate]);

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile || !apiUrl) return;
    const newSongName = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/^\.+/, '').trim() || 'Untitled Song';
    setSongName(newSongName);
    resetProject();
    setIsProcessing(true);
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
      
      if (!metadata) {
        throw new Error('Missing metadata. Please stop and restart the backend server to apply the recent schema fixes.');
      }

      const newId = `${Date.now()}-lab`;
      const saveRes = await fetch(`${getBackendUrl()}/api/remix/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newId,
          name: newSongName,
          stems: rawStems,
          chords: metadata.chords,
          beats: metadata.beats,
          tempo: metadata.tempo,
          engine: engineMode.includes('Demucs') ? 'Demucs' : 'RoFormer'
        })
      });
      const { localStems } = await saveRes.json();
      const finalStems: Record<string, string> = {};
      Object.keys(localStems).forEach(k => {
        finalStems[k] = `${getBackendUrl()}${localStems[k]}`;
      });
      setStems(finalStems);
      setChords(metadata.chords);
      setBeats(metadata.beats);
      setTempo(metadata.tempo);
      loadAudioSources(finalStems);
      fetchHistory();
      setIsProcessing(false);
      navigate(`/tools/remix-lab?project=${newId}`, { replace: true });
    } catch (err) {
      console.error('nitro error:', err);
      setIsProcessing(false);
    }
  };

  const handleExport = useCallback((item: { id: string; name?: string }) => {
    const downloadUrl = `${getBackendUrl()}/api/remix/export/${item.id}`;
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = `${item.name || item.id}.zip`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/remix/delete/${id}`, { method: 'DELETE' });
      if (res.ok) fetchHistory();
    } catch (err) {
      console.error('Delete error:', err);
    }
  }, [fetchHistory]);

  const handleRename = useCallback(async (id: string, oldName: string, newName: string) => {
    if (!newName || oldName === newName) return;
    try {
      const res = await fetch(`${getBackendUrl()}/api/remix/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: newName })
      });
      if (res.ok) fetchHistory();
    } catch (err) {
      console.error('Rename error:', err);
    }
  }, [fetchHistory]);

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
            getBackendUrl={getBackendUrl}
            handleUpload={handleUpload}
            history={history}
            onSelectHistory={item => navigate(`/tools/remix-lab?project=${item.id}`)}
            onExportHistory={handleExport}
            onDeleteHistory={handleDelete}
            onRenameHistory={handleRename}
            onExit={onExit}
          />
        ) : (
          <div className='flex-1 w-full flex flex-col items-center justify-between min-h-0 overflow-hidden'>
            <ChordDisplay
              chords={chords} beats={beats}
              gridShift={gridShift}
            />
            <div className='w-full flex-1 flex justify-center px-4 py-4 overflow-y-auto scrollbar-none'>
              <MixerControls />
            </div>
            <PlayerControls setShowLyricsSheet={setShowLyricsSheet} />
          </div>
        )}
      </main>
      <LyricsSheet showLyricsSheet={showLyricsSheet} setShowLyricsSheet={setShowLyricsSheet} projectId={lastLoadedProjectRef.current || ''} getBackendUrl={getBackendUrl} />
      <MetronomeSheet />
    </div>
  );
};

const RemixLab = (props: { onExit: () => void }) => (
  <RemixProvider>
    <RemixLabContent {...props} />
  </RemixProvider>
);

export default RemixLab;
