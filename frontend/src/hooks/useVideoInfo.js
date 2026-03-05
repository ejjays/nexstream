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

  const fetchInfo = useCallback(
    async (inputUrl) => {
      const finalUrl = typeof inputUrl === 'string' ? inputUrl : url;
      if (!finalUrl || typeof finalUrl !== 'string') return;

      const currentClientId = generateUUID();

      setLoading(true);
      setError('');
      setVideoData(null);
      setIsPickerOpen(false);
      setStatus('fetching_info');
      setTargetProgress(10);
      setSubStatus('Initializing Engine...');
      setPendingSubStatuses([]);
      setDesktopLogs([]);

      readSse(
        `${BACKEND_URL}/events?id=${currentClientId}`,
        data =>
          handleSseMessage(data, finalUrl, {
            setStatus,
            setVideoData,
            setIsPickerOpen,
            setPendingSubStatuses,
            setDesktopLogs,
            setTargetProgress,
            setProgress,
            setSubStatus
          }),
        () => setError('Progress stream disconnected')
      );

      try {
        await new Promise(r => setTimeout(r, 500));
        const response = await fetch(
          `${BACKEND_URL}/info?url=${encodeURIComponent(
            finalUrl
          )}&id=${currentClientId}`,
          {
            headers: {
              'ngrok-skip-browser-warning': 'true',
              'bypass-tunnel-reminder': 'true'
            }
          }
        );
        
        if (!response.ok) throw new Error('Failed to fetch video details');
        const data = await response.json();
        
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
