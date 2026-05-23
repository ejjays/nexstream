import { useCallback } from 'react';
import { useRemixStore } from '../store/useRemixStore';
import { BACKEND_URL } from '../lib/config';
import { VideoInfo, FinalResponse } from '@shared/schemas/media.schema.js';

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
    async (inputUrl?: string) => {
      const finalUrl = typeof inputUrl === 'string' ? inputUrl : url;
      if (!finalUrl || typeof finalUrl !== 'string') return;

      let cleanedUrl = finalUrl;
      if (cleanedUrl.includes('%')) {
        try {
          const decoded = decodeURIComponent(cleanedUrl);
          if (decoded.startsWith('http')) cleanedUrl = decoded;
        } catch(_e) { /* ignore */ }
      }
      cleanedUrl = cleanedUrl.split('&id=')[0].split('?id=')[0];

      setLoading(true);
      setError('');

      // check URL change
      if (useRemixStore.getState().videoData?.webpage_url !== cleanedUrl) {
          setVideoData(null);
      }

      setIsPickerOpen(false);
      setStatus('fetching_info');
      setTargetProgress(10);
      setSubStatus('Initializing Engine...');
      setPendingSubStatuses([]);

      // start session
      setSessionStartTime(Date.now());
      setDesktopLogs(['[0:00] Initializing NexStream Core Engine...']);


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
          } catch(_e) { /* ignore */ }
          throw new Error(`${errorMsg} (${response.status})`);
        }

        const data = await response.json();

        if (data.thumbnail && data.thumbnail.includes('localhost:5000')) {
          data.thumbnail = data.thumbnail.replace(/http:\/\/localhost:5000/g, backendUrl);
        }
        if (data.cover && data.cover.includes('localhost:5000')) {
          data.cover = data.cover.replace(/http:\/\/localhost:5000/g, backendUrl);
        }

        setVideoData((prev: VideoInfo | null) => {
          // preserve full data
          const isNowFull = data.formats && data.formats.length > 0;
          const wasAlreadyFull = prev?.formats && prev.formats.length > 0;
          
          if (wasAlreadyFull && !isNowFull) {
            console.log("[Info] Preserving full formats from previous SSE update");
            return {
              ...prev,
              ...data,
              formats: prev!.formats,
              audioFormats: (prev as any).audioFormats,
              isPartial: false
            } as VideoInfo;
          }

          return {
            ...prev,
            ...data,
            isPartial: !isNowFull && (prev?.isPartial !== false),
            previewUrl: data.previewUrl || data.spotifyMetadata?.previewUrl || prev?.previewUrl
          } as VideoInfo;
        });

        if (finalUrl.toLowerCase().includes('spotify.com')) {
          setSelectedFormat('mp3');
          const spotify = data.spotifyMetadata;
          if (spotify?.previewUrl) {
            setPlayerData({
              ...data,
              id: spotify.id || data.id,
              title: spotify.title || data.title,
              artist: spotify.artist || data.artist,
              uploader: spotify.artist || data.uploader,
              album: spotify.album || data.album || '',
              cover: spotify.cover || spotify.imageUrl || data.cover || '/logo.webp',
              thumbnail: spotify.thumbnail || spotify.imageUrl || data.thumbnail || data.cover || '/logo.webp',
              previewUrl: spotify.previewUrl,
              formats: data.formats || [],
              audioFormats: data.audioFormats || [],
              isPartial: data.isPartial || false,
              isIsrcMatch: data.isIsrcMatch || false,
              webpage_url: data.webpage_url || finalUrl
            } as FinalResponse);
            setShowPlayer(true);
          }
        }

        // trigger modal
        setIsPickerOpen(true);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(String(err));
        }
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
      setShowPlayer,
      setSessionStartTime
    ]
  );

  return { fetchInfo };
};
