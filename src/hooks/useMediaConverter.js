import { useState, useRef, useEffect } from 'react';
import { BACKEND_URL } from '../lib/config';

export const useMediaConverter = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [subStatus, setSubStatus] = useState('');
  const [desktopLogs, setDesktopLogs] = useState([]);
  const [pendingSubStatuses, setPendingSubStatuses] = useState([]);
  const [videoTitle, setVideoTitle] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerData, setPlayerData] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const titleRef = useRef('');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (pendingSubStatuses.length === 0) return;

    const nextStatus = pendingSubStatuses[0];

    if (nextStatus.startsWith('RECEIVING DATA:')) {
      setSubStatus(nextStatus);
      setPendingSubStatuses(prev => prev.slice(1));
      return;
    }

    const timer = setTimeout(() => {
      setSubStatus(nextStatus);
      setPendingSubStatuses(prev => prev.slice(1));
    }, 750);

    return () => clearTimeout(timer);
  }, [pendingSubStatuses, subStatus]);

  useEffect(() => {
    if (!loading && status !== 'completed') return;

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= targetProgress) return prev;
        const diff = targetProgress - prev;
        const step = diff > 1 ? diff * 0.08 : 0.05;
        return Math.min(prev + step, targetProgress);
      });
    }, 16);

    return () => clearInterval(interval);
  }, [loading, targetProgress, status]);

  useEffect(() => {
    if (status !== 'fetching_info' && status !== 'initializing') return;

    const interval = setInterval(() => {
      setTargetProgress(prev => {
        if (status === 'fetching_info') {
          if (prev >= 90) return prev;
          const increment = prev < 50 ? Math.random() * 0.6 + 0.2 : Math.random() * 0.2 + 0.05;
          return Math.min(prev + increment, 90);
        }
        
        if (prev >= 20) return prev;
        return Math.min(prev + 0.2, 20);
      });
    }, status === 'fetching_info' ? 50 : 80);

    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (url.toLowerCase().includes('spotify.com')) {
      setSelectedFormat('mp3');
    }
  }, [url]);

  useEffect(() => {
    // Reactive Music Player: Initialize the moment previewUrl AND Title are available
    if (videoData?.previewUrl && videoData?.title && isPickerOpen) {
      // Only set if the preview URL has actually changed or player isn't showing
      if (!playerData || playerData.previewUrl !== videoData.previewUrl) {
        setPlayerData({
          title: videoData.title,
          artist: videoData.artist,
          imageUrl: videoData.cover,
          previewUrl: videoData.previewUrl
        });
        setShowPlayer(true);
      }
    }
  }, [videoData?.previewUrl, videoData?.title, isPickerOpen, playerData]);

  const handleDownloadTrigger = async (e, overrideUrl) => {
    if (e) e.preventDefault();
    const finalUrl = overrideUrl || url;
    
    if (!finalUrl) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');

    if (finalUrl.toLowerCase().includes('spotify.com') && !finalUrl.toLowerCase().includes('/track/')) {
        setError('Please use a direct Spotify track link. Artist, Album, and Playlist links are not supported.');
        setLoading(false);
        return;
    }

    setStatus('fetching_info');
    setPendingSubStatuses(['Connecting to API network...']);
    setSubStatus('');
    setDesktopLogs(['Connecting to API network...']);
    setVideoTitle('');
    setProgress(0);
    setTargetProgress(1);

    const clientId = window.crypto.randomUUID();
    const eventSource = new EventSource(`${BACKEND_URL}/events?id=${clientId}`);

    // Wait for SSE handshake to complete before starting the heavy fetch
    const sseReady = new Promise((resolve) => {
      eventSource.onopen = () => {
        console.log('[SSE] Connection Established');
        resolve();
      };
    });

    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.status) setStatus(data.status);
        
        if (data.metadata_update) {
          const update = data.metadata_update;
          const isSpotify = url.toLowerCase().includes('spotify.com');
          
          setVideoData(prev => {
            // Logic: Data is partial only if it wasn't already full AND the update isn't full.
            const wasAlreadyFull = prev?.isPartial === false;
            const isNowFull = update.isFullData === true;
            
            return {
              ...prev,
              title: update.title || prev?.title,
              artist: update.artist || prev?.artist,
              cover: update.cover || prev?.cover,
              thumbnail: update.cover || prev?.thumbnail,
              duration: update.duration || prev?.duration || 0,
              previewUrl: update.previewUrl || prev?.previewUrl,
              formats: update.formats || prev?.formats || [],
              audioFormats: update.audioFormats || prev?.audioFormats || [],
              isPartial: (wasAlreadyFull || isNowFull) ? false : true,
              // CRITICAL: Ensure spotifyMetadata exists so MainContent chooses the right picker
              spotifyMetadata: isSpotify ? (prev?.spotifyMetadata || update || true) : null
            };
          });
          
          // FORCE IMMEDIATE RENDER: Break out of React's state batching
          setTimeout(() => setIsPickerOpen(true), 0);
        }

        if (data.subStatus) {
          if (data.subStatus.startsWith('STREAM ESTABLISHED')) setSubStatus(data.subStatus);
          else setPendingSubStatuses(prev => [...prev, data.subStatus]);
          setDesktopLogs(prev => [...prev, data.subStatus]);
        }

        if (data.details) setDesktopLogs(prev => [...prev, data.details]);

        if (data.progress !== undefined) {
          setTargetProgress(prev => Math.max(prev, data.progress));
          if (data.details?.startsWith('BRAIN_LOOKUP_SUCCESS')) setProgress(data.progress);
        }
      } catch (e) {
        console.error(e);
      }
    };

    try {
      // Ensure SSE is listening before we trigger the info task
      await sseReady;

      const response = await fetch(
        `${BACKEND_URL}/info?url=${encodeURIComponent(finalUrl)}&id=${clientId}`,
        {
          headers: {
            'ngrok-skip-browser-warning': 'true',
            'bypass-tunnel-reminder': 'true'
          }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch video details');

      const data = await response.json();
      
      // MERGE FETCH DATA WITH EARLY SSE DATA
      setVideoData(prev => ({
        ...data,
        // Preserve isPartial if data is somehow incomplete, 
        // but usually info response is full
        isPartial: false 
      }));

      if (finalUrl.toLowerCase().includes('spotify.com')) {
        setSelectedFormat('mp3');
        const spotify = data.spotifyMetadata;

        if (spotify && spotify.previewUrl && !playerData) {
          setPlayerData({
            title: spotify.title,
            artist: spotify.artist,
            imageUrl: spotify.cover || spotify.imageUrl || data.cover,
            previewUrl: spotify.previewUrl
          });
          setShowPlayer(true);
        }
      }

      setTargetProgress(90);
      if (data.spotifyMetadata?.fromBrain) setProgress(90);
      
      // Ensure picker stays open if it was already opened by SSE
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
    setError('');
    setStatus('initializing');
    setPendingSubStatuses(['Preparing background tasks...']);
    setSubStatus('');
    setDesktopLogs([]);

    const finalTitle = metadataOverrides.title || videoData?.title || '';
    setVideoTitle(finalTitle);
    titleRef.current = finalTitle;

    const clientId = window.crypto.randomUUID();
    const eventSource = new EventSource(`${BACKEND_URL}/events?id=${clientId}`);

    eventSource.onopen = () => console.log('[SSE] Connection Established');
    eventSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'error') {
          setError(data.message);
          setLoading(false);
          eventSource.close();
          return;
        }

        if (data.status) setStatus(data.status);
        
        if (data.subStatus) {
          const isStreamEstablished = data.subStatus.startsWith('STREAM ESTABLISHED');
          if (isStreamEstablished) setSubStatus(data.subStatus);
          else setPendingSubStatuses(prev => [...prev, data.subStatus]);
          setDesktopLogs(prev => [...prev, data.subStatus]);
        }

        if (data.details) setDesktopLogs(prev => [...prev, data.details]);

        if (data.progress !== undefined) {
          const newProgress = Math.max(targetProgress, data.progress);
          setTargetProgress(newProgress);
          if (data.progress === 100) setProgress(100);
        }

        if (data.title && !metadataOverrides.title) {
          setVideoTitle(data.title);
          titleRef.current = data.title;
        }

        if (data.status === 'downloading' && data.progress === 100) {
          setTargetProgress(100);
          setTimeout(() => {
            setLoading(false);
            setStatus('completed');
            eventSource.close();
          }, 800);
        }
      } catch (e) {
        console.error(e);
      }
    };

    try {
      // REMOVE ARTIFICIAL DELAY FOR MP3 - EVERY MS COUNTS
      if (!url.toLowerCase().includes('mp3') && selectedFormat !== 'mp3') {
        await new Promise(r => setTimeout(r, 200));
      }

      const selectedOption = (
        selectedFormat === 'mp4' ? videoData?.formats : videoData?.audioFormats
      )?.find(f => f.format_id === formatId);

      const finalFormatParam = selectedOption?.extension || (formatId === 'mp3' ? 'mp3' : selectedFormat);

      const queryParams = new URLSearchParams({
        url: url,
        id: clientId,
        format: finalFormatParam,
        formatId: formatId,
        filesize: selectedOption?.filesize || '',
        title: finalTitle,
        artist: metadataOverrides.artist || videoData?.artist || '',
        album: metadataOverrides.album || videoData?.album || '',
        year: videoData?.spotifyMetadata?.year || '',
        targetUrl: videoData?.spotifyMetadata?.targetUrl || ''
      });

      const downloadUrl = `${BACKEND_URL}/convert?${queryParams.toString()}`;

      // ALWAYS USE POST FOR ALL FORMATS
      // This avoids URI_TOO_LONG errors when imageUrl is a large base64 string (common in Super Brain hits)
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `${BACKEND_URL}/convert`;

      queryParams.forEach((value, key) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
      setLoading(false);
      eventSource.close();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  };

  return {
    url, setUrl, loading, error, progress, status, subStatus, desktopLogs,
    videoTitle, selectedFormat, setSelectedFormat, isPickerOpen, setIsPickerOpen,
    videoData, showPlayer, setShowPlayer, playerData, isMobile,
    handleDownloadTrigger, handleDownload, handlePaste
  };
};
