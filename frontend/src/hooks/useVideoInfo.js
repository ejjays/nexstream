import { useCallback } from 'react';
import { useRemixStore } from '../store/useRemixStore';
import { BACKEND_URL } from '../lib/config';

export const useVideoInfo = () => {
  const backendUrl = useRemixStore((state) => state.backendUrl) || BACKEND_URL;
  const clientId = useRemixStore((state) => state.clientId);
  const url = useRemixStore((state) => state.url);
  const setVideoData = useRemixStore((state) => state.setVideoData);
  const setIsPickerOpen = useRemixStore((state) => state.setIsPickerOpen);
  const setStatus = useRemixStore((state) => state.setStatus);
  const setTargetProgress = useRemixStore((state) => state.setTargetProgress);
  const setSubStatus = useRemixStore((state) => state.setSubStatus);
  const setPendingSubStatuses = useRemixStore((state) => state.setPendingSubStatuses);
  const setDesktopLogs = useRemixStore((state) => state.setDesktopLogs);
  const setSessionStartTime = useRemixStore((state) => state.setSessionStartTime);
  const setLoading = useRemixStore((state) => state.setLoading);
  const setError = useRemixStore((state) => state.setError);
  const setSelectedFormat = useRemixStore((state) => state.setSelectedFormat);
  const setPlayerData = useRemixStore((state) => state.setPlayerData);
  const setShowPlayer = useRemixStore((state) => state.setShowPlayer);

  const fetchInfo = useCallback(
    async (inputUrl) => {
      const finalUrl = typeof inputUrl === 'string' ? inputUrl : url;
      if (!finalUrl || typeof finalUrl !== 'string') return;

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

      // start session
      setSessionStartTime(Date.now());
      setDesktopLogs([`[0:00] Initializing NexStream Core Engine...`]);


      try {
        const response = await fetch(`${backendUrl}/info?url=${encodeURIComponent(cleanedUrl)}&id=${clientId}`, {
          headers: {
            'ngrok-skip-browser-warning': 'true',
            'bypass-tunnel-reminder': 'true'
          }
        });

        if (!response.ok) {
          let errorMsg = 'Failed to fetch video details';
          try {
            const errJson = await response.json();
            if (errJson.error) errorMsg = errJson.error;
          } catch(e) {}
          throw new Error(`${errorMsg} (${response.status})`);
        }

        const data = await response.json();

        if (data.thumbnail && data.thumbnail.includes('localhost:5000')) {
          data.thumbnail = data.thumbnail.replace(/http:\/\/localhost:5000/g, backendUrl);
        }
        if (data.cover && data.cover.includes('localhost:5000')) {
          data.cover = data.cover.replace(/http:\/\/localhost:5000/g, backendUrl);
        }

        setVideoData(prev => ({
          ...prev,
          ...data,
          isPartial: !(data.formats && data.formats.length > 0),
          previewUrl: data.previewUrl || data.spotifyMetadata?.previewUrl || prev?.previewUrl
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

        setTargetProgress(90);
        setIsPickerOpen(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [
      url,
      backendUrl,
      clientId,
      setStatus,
      setTargetProgress,
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
