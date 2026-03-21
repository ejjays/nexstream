import React, { useState, useEffect } from 'react';
import { X, Loader2, Music, ExternalLink, RefreshCw } from 'lucide-react';

const LyricsSheet = ({ showLyricsSheet, setShowLyricsSheet, projectId, getBackendUrl }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (showLyricsSheet && projectId && !hasFetched && !data) {
      fetchLyricsData();
    }
  }, [showLyricsSheet, projectId, hasFetched, data]);

  const fetchLyricsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getBackendUrl()}/api/remix/extract/${projectId}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to extract data');
      }
      const jsonData = await res.json();
      setData(jsonData);
      setHasFetched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!showLyricsSheet) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] transition-opacity"
        onClick={() => setShowLyricsSheet(false)}
      />
      
      <div 
        className={`fixed bottom-0 left-0 right-0 bg-[#18181b] rounded-t-3xl z-[201] transition-transform duration-300 ease-out transform ${showLyricsSheet ? 'translate-y-0' : 'translate-y-full'} flex flex-col`}
        style={{ height: '80vh' }}
      >
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Music className="text-cyan-400 w-5 h-5" />
            <h2 className="text-lg font-bold text-white">Song Lyrics & Info</h2>
          </div>
          <button 
            onClick={() => setShowLyricsSheet(false)}
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-none p-6 pb-20 text-white">
          {!projectId ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <p>No project loaded. Are you on a Demo song?</p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-zinc-400 text-sm animate-pulse text-center">
                Analyzing audio fingerprint...<br/>
                <span className="text-xs opacity-70">This takes a few seconds via AcoustID & Shazam</span>
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4 text-center">
              <div className="p-4 bg-red-500/10 rounded-full text-red-400">
                <X size={32} />
              </div>
              <div className="space-y-2">
                <p className="text-red-400 font-medium">Analysis Failed</p>
                <p className="text-zinc-500 text-sm max-w-[250px]">{error}</p>
              </div>
              <button 
                onClick={fetchLyricsData}
                className="mt-4 px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-sm font-medium transition-colors flex items-center gap-2"
              >
                <RefreshCw size={14} /> Try Again
              </button>
            </div>
          ) : data ? (
            <div className="space-y-8 max-w-2xl mx-auto">
              <div className="text-center space-y-1">
                <h3 className="text-2xl font-bold text-white">{data.title}</h3>
                <p className="text-cyan-400 text-lg">{data.artist}</p>
              </div>

              {data.chordsLink && (
                <a 
                  href={data.chordsLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl text-zinc-300 transition-colors border border-zinc-700/50"
                >
                  <span className="font-medium">View Guitar Chords on UG</span>
                  <ExternalLink size={16} className="opacity-70" />
                </a>
              )}

              <div className="bg-black/30 rounded-2xl p-6 border border-zinc-800/50">
                {data.lyrics ? (
                  <pre className="font-sans whitespace-pre-wrap text-zinc-300 text-center leading-loose text-lg font-medium">
                    {data.lyrics}
                  </pre>
                ) : (
                  <p className="text-center text-zinc-500 italic py-10">
                    We successfully identified the song, but couldn't find lyrics for it online.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};

export default LyricsSheet;
