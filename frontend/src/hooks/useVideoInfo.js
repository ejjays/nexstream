import { useCallback } from 'react';
import { BACKEND_URL } from '../lib/config';
import { handleSseMessage } from './useSSE';

export const useVideoInfo = ({
  url,
  readSse,
  setLoading,
  setError,
  setVideoData,
  setIsPickerOpen,
  setStatus,
  setTargetProgress,
  setProgress,
  setSubStatus,
  setPendingSubStatuses,
  setDesktopLogs,
  setSelectedFormat,
  setPlayerData,
  setShowPlayer,
  generateUUID
}) => {
  const getTS = () => {
    const n = new Date();
    return `[${n.getHours().toString().padStart(2, '0')}:${n.getMinutes().toString().padStart(2, '0')}:${n.getSeconds().toString().padStart(2, '0')}.${n.getMilliseconds().toString().padStart(3, '0')}]`;
  };

  const fetchInfo = useCallback(
    async (inputUrl) => {
      const finalUrl = typeof inputUrl === 'string' ? inputUrl : url;
      if (!finalUrl || typeof finalUrl !== 'string') return;

      // prepare client
      const currentClientId = generateUUID();
      
      let cleanedUrl = finalUrl;
      if (cleanedUrl.includes('%')) {
        try {
          const decoded = decodeURIComponent(cleanedUrl);
          if (decoded.startsWith('http')) cleanedUrl = decoded;
        } catch(e) {}
      }
      cleanedUrl = cleanedUrl.split('&id=')[0].split('?id=')[0];

      setLoading(true);
      setError('');
      setVideoData(null);
      setIsPickerOpen(false);
      setStatus('fetching_info');
      setTargetProgress(10);
      setSubStatus('Initializing Engine...');
      setPendingSubStatuses([]);
      setDesktopLogs([]);

      // start progress stream
      readSse(
        `${BACKEND_URL}/events?id=${currentClientId}`,
        data =>
          handleSseMessage(data, cleanedUrl, {
            setStatus,
            setVideoData,
            setIsPickerOpen,
            setPendingSubStatuses,
            setDesktopLogs,
            setTargetProgress,
            setProgress,
            setSubStatus,
            getTS
          }),
        () => setError('Progress stream disconnected')
      );

      try {
        // fetch metadata
        const data = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', `${BACKEND_URL}/info?url=${encodeURIComponent(cleanedUrl)}&id=${currentClientId}`);
          xhr.withCredentials = false;
          xhr.setRequestHeader('ngrok-skip-browser-warning', 'true');
          xhr.setRequestHeader('bypass-tunnel-reminder', 'true');
          
          xhr.onload = () => {
             if (xhr.status >= 200 && xhr.status < 300) {
                 try { resolve(JSON.parse(xhr.responseText)); } 
                 catch(e) { reject(new Error('Invalid JSON response from server')); }
             } else {
                 let errorMsg = 'Failed to fetch video details';
                 try {
                   const errJson = JSON.parse(xhr.responseText);
                   if (errJson.error) errorMsg = errJson.error;
                 } catch(e) {}
                 reject(new Error(`${errorMsg} (${xhr.status})`));
             }
          };
          xhr.onerror = () => reject(new Error('Network error fetching video info. Check your connection.'));
          xhr.send();
        });
        
        setVideoData(prev => ({
          ...prev,
          ...data,
          isPartial: !(data.formats && data.formats.length > 0),
          previewUrl:
            data.previewUrl ||
            data.spotifyMetadata?.previewUrl ||
            prev?.previewUrl
        }));

        if (finalUrl.toLowerCase().includes('spotify.com')) {
          setSelectedFormat('mp3');
          const spotify = data.spotifyMetadata;
          if (spotify?.previewUrl) {
            setPlayerData({
              title: spotify.title,
              artist: spotify.artist,
              imageUrl: spotify.cover || spotify.imageUrl || data.cover,
              previewUrl: spotify.previewUrl
            });
            setShowPlayer(true);
          }
        }

        const isFullData = data.formats && data.formats.length > 0;
        if (isFullData) {
          setTargetProgress(90);
          setProgress(90);
        } else {
          setTargetProgress(90);
        }

        setIsPickerOpen(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [
      url,
      generateUUID,
      readSse,
      setStatus,
      setTargetProgress,
      setProgress,
      setSubStatus,
      setPendingSubStatuses,
      setDesktopLogs,
      setLoading,
      setError,
      setVideoData,
      setIsPickerOpen,
      setSelectedFormat,
      setPlayerData,
      setShowPlayer
    ]
  );

  return { fetchInfo };
};
