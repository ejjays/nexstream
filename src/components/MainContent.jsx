import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import meowCool from '../assets/meow.png';
import { Link, Loader2, FileVideo, AlertCircle, CheckCircle2 } from 'lucide-react';
import YouTubeIcon from '../assets/icons/YouTubeIcon.jsx';
import MusicIcon from '../assets/icons/MusicIcon.jsx';
import PasteIcon from '../assets/icons/PasteIcon.jsx';
import GlowButton from './ui/GlowButton.jsx';
import VideoIcon from '../assets/icons/VideoIcon.jsx';
import QualityPicker from './modals/QualityPicker.jsx';

const MainContent = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const titleRef = useRef('');

  useEffect(() => {
    if (url.toLowerCase().includes('spotify.com')) {
      setSelectedFormat('mp3');
    }
  }, [url]);

  const handleDownloadTrigger = async (e) => {
    if (e) e.preventDefault();
    if (!url) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setStatus('fetching_info');
    setProgress(0);

    const clientId = Date.now().toString();
    const BACKEND_URL = import.meta.env.VITE_API_URL;
    const eventSource = new EventSource(`${BACKEND_URL}/events?id=${clientId}`);

    eventSource.onmessage = event => {
      const data = JSON.parse(event.data);
      if (data.status === "fetching_info") {
        setProgress(data.progress || 0);
      }
    };

    try {
      const response = await fetch(`${BACKEND_URL}/info?url=${encodeURIComponent(url)}&id=${clientId}`, {
        headers: { 
          'ngrok-skip-browser-warning': 'true',
          'bypass-tunnel-reminder': 'true'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch video details');
      }

      const data = await response.json();
      
      // If it's a Spotify link, force audio format
      if (url.includes('spotify.com')) {
        setSelectedFormat('mp3');
      }
      
      setProgress(100);
      setVideoData(data);
      setIsPickerOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      eventSource.close();
    }
  };

  const handleDownload = async (formatId, metadataOverrides = {}) => {
    setIsPickerOpen(false);
    setLoading(true);
    setError("");
    setProgress(0);
    setStatus("initializing");
    
    const finalTitle = metadataOverrides.title || videoData?.title || "";
    setVideoTitle(finalTitle);
    titleRef.current = finalTitle;

    const clientId = Date.now().toString();
    const BACKEND_URL = import.meta.env.VITE_API_URL;
    const eventSource = new EventSource(`${BACKEND_URL}/events?id=${clientId}`);

    eventSource.onmessage = event => {
      const data = JSON.parse(event.data);
      if (data.status === "error") {
        setError(data.message);
        setLoading(false);
        eventSource.close();
      } else {
        setStatus(data.status);
        if (data.progress !== undefined) setProgress(data.progress);
        if (data.title) {
          // Only update if we didn't manually set it
          if (!metadataOverrides.title) {
             setVideoTitle(data.title);
             titleRef.current = data.title;
          }
        }
      }
    };

    try {
      const queryParams = new URLSearchParams({
        url: url,
        id: clientId,
        format: selectedFormat,
        formatId: formatId,
        title: finalTitle,
        artist: metadataOverrides.artist || videoData?.artist || '',
        album: metadataOverrides.album || videoData?.album || '',
        imageUrl: videoData?.cover || '',
        year: videoData?.spotifyMetadata?.year || '',
        targetUrl: videoData?.spotifyMetadata?.targetUrl || ''
      });

      const response = await fetch(`${BACKEND_URL}/convert`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          'bypass-tunnel-reminder': 'true'
        },
        body: JSON.stringify(Object.fromEntries(queryParams))
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Download failed");
      }

      // Default to the title we already know (from ref), or 'video' if missing
      let filename = titleRef.current
        ? `${titleRef.current.replace(/[<>:"/\\|?*]/g, "")}.${selectedFormat}`
        : `file.${selectedFormat}`;

      // Try to get the exact filename from the server header
      const disposition = response.headers.get("Content-Disposition");
      if (disposition && disposition.indexOf("attachment") !== -1) {
        const filenameRegex = /filename[^;=]*=((['"]).*?\2|[^;]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, "");
        }
      }

      const blob = await response.blob();
      
      // FINALLY set to 100% and completed ONLY after blob is fully in browser memory
      setProgress(100);
      setStatus("completed");

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error(err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
      eventSource.close();
    }
  };

  const getStatusText = () => {
    const formatName = selectedFormat === "mp4" ? "video" : "audio";
    switch (status) {
      case "fetching_info":
        return progress > 0 ? `Analyzing ${formatName} (${progress}%)` : `Analyzing ${formatName}...`;
      case "downloading":
        return `Downloading (${progress}%)`;
      case "merging":
        return "Finalizing file (almost done)...";
      case "sending":
        return "Sending to device...";
      case "completed":
        return "Complete!";
      case "initializing":
        return progress > 0 ? `Preparing (${progress}%)` : "Initializing...";
      default:
        return "Processing...";
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (err) {
      console.error("Failed to read clipboard", err);
    }
  };

  return (
    <div className="flex flex-col justify-center items-center w-full gap-3 px-4">
      <img className="w-56" src={meowCool} alt="cool cat" />
      <div className="w-full max-w-md flex items-center relative">
        <div className="absolute inset-y-0 left-2 flex items-center pl-1">
          <div className="relative flex items-center justify-center">
            <span className="animate-ping absolute inline-flex h-2/3 w-2/3 rounded-full bg-cyan-500 opacity-50"></span>
            <span className="relative p-1 rounded-full flex items-center justify-center">
              <Link className="w-5 h-5 text-cyan-500" />
            </span>
          </div>
        </div>
        <input
          className="border-cyan-400 border-2 p-2 w-full rounded-xl placeholder-gray-500 pl-10 focus:outline-none bg-transparent text-white"
          type="text"
          placeholder="paste your link here"
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
      </div>
      <div className="w-full max-w-md mt-1">
        <div className="flex bg-cyan-500 w-full rounded-2xl divide-x divide-white/30 overflow-hidden shadow-lg border border-cyan-400/50">
          <button
            disabled={url.toLowerCase().includes('spotify.com')}
            className={`btns flex-1 transition-all duration-300 ${
              selectedFormat === "mp4"
                ? "bg-white text-cyan-900 shadow-inner scale-105 z-10"
                : "hover:bg-white/10 text-black"
            } ${url.toLowerCase().includes('spotify.com') ? 'opacity-40 cursor-not-allowed filter grayscale-[0.8]' : ''}`}
            onClick={() => setSelectedFormat("mp4")}
          >
            <VideoIcon size={29} />
            <span className="truncate">Video</span>
          </button>
          <button
            className={`btns flex-1 transition-all duration-300 ${
              selectedFormat === "mp3"
                ? "bg-white text-cyan-900 shadow-inner scale-105 z-10"
                : "hover:bg-white/10 text-black"
            }`}
            onClick={() => setSelectedFormat("mp3")}
          >
            <MusicIcon
              color={selectedFormat === "mp3" ? "#083344" : "#fff"}
              size={24}
            />
            <span className="truncate">Audio</span>
          </button>
          <button
            className="btns flex-1 hover:bg-white/10 transition-all text-black"
            onClick={handlePaste}
          >
            <PasteIcon size={24} />
            <span className="truncate">Paste</span>
          </button>
        </div>
      </div>
      <div className="pt-2">
        <GlowButton 
          text={loading ? 'Processing...' : 'Convert & Download'} 
          onClick={handleDownloadTrigger}
          disabled={loading}
        />
      </div>

      <QualityPicker 
        isOpen={isPickerOpen} 
        onClose={() => setIsPickerOpen(false)} 
        selectedFormat={selectedFormat}
        videoData={videoData}
        onSelect={handleDownload}
      />

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full max-w-md mt-4 bg-black/20 rounded-2xl p-4 border border-cyan-500/30"
          >
            <div className="flex justify-between mb-2 text-xs text-cyan-400">
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                {getStatusText()}
              </span>
              <span>{progress}%</span>
            </div>

            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden relative">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full relative"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
              </motion.div>
            </div>

            {videoTitle && (
              <div className="mt-3 flex items-center gap-2 pt-3 border-t border-white/10 text-white">
                <FileVideo size={16} className="text-cyan-500 shrink-0" />
                <span className="text-xs truncate font-medium">
                  {videoTitle}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-md mt-4 bg-red-500/10 text-red-300 p-3 rounded-xl border border-red-500/20 flex items-center gap-2 text-xs"
          >
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {status === "completed" && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-emerald-400 flex items-center justify-center gap-2 text-sm font-medium"
        >
          <CheckCircle2 size={16} />
          <span>Success! File downloaded.</span>
        </motion.div>
      )}
    </div>
  );
};

export default MainContent;
