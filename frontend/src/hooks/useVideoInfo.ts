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
  const setPendingSubStatuses = useRemixStore(
    (state) => state.setPendingSubStatuses
  );
  const setDesktopLogs = useRemixStore((state) => state.setDesktopLogs);
  const setSessionStartTime = useRemixStore(
    (state) => state.setSessionStartTime
  );
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
        } catch (_e) {
          /* ignore */
        }
      }
      cleanedUrl = cleanedUrl.split('&id=')[0].split('?id=')[0];

      setLoading(true);
      setError('');

      // check URL change
      if (useRemixStore.getState().videoData?.webpageUrl !== cleanedUrl) {
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
        const response = await fetch(
          `${backendUrl}/info?url=${encodeURIComponent(cleanedUrl)}&id=${clientId}`,
          {
            headers: {
              'ngrok-skip-browser-warning': 'true',
              'bypass-tunnel-reminder': 'true',
            },
          }
        );

        if (!response.ok) {
          let errorMsg = 'Failed to fetch video details';
          try {
            const errJson = await response.json();
            if (errJson.error) errorMsg = errJson.error;
          } catch (_e) {
            /* ignore */
          }
          throw new Error(`${errorMsg} (${response.status})`);
        }

        const data = (await response.json()) as VideoInfo;

        const updatedData = _mapVideoMetadata(data, backendUrl);

        setVideoData((prev: VideoInfo | null) => {
          // preserve full data
          const isNowFull =
            updatedData.formats && updatedData.formats.length > 0;
          const wasAlreadyFull = prev?.formats && prev.formats.length > 0;

          if (wasAlreadyFull && !isNowFull && prev) {
            console.log(
              '[Info] Preserving full formats from previous SSE update'
            );
            return {
              ...prev,
              ...updatedData,
              formats: prev.formats,
              audioFormats: prev.audioFormats,
              isPartial: false,
            } as VideoInfo;
          }

          return {
            ...prev,
            ...updatedData,
            isPartial: !isNowFull && prev?.isPartial !== false,
            previewUrl:
              updatedData.previewUrl ||
              updatedData.spotifyMetadata?.previewUrl ||
              prev?.previewUrl,
          } as VideoInfo;
        });

        if (finalUrl.toLowerCase().includes('spotify.com')) {
          setSelectedFormat('mp3');
          const spotify = updatedData.spotifyMetadata;
          if (spotify?.previewUrl) {
            setPlayerData({
              ...updatedData,
              id: spotify.id || updatedData.id,
              title: spotify.title || updatedData.title,
              artist: spotify.artist || updatedData.artist,
              uploader: spotify.artist || updatedData.uploader,
              album: spotify.album || updatedData.album || '',
              cover:
                spotify.cover ||
                spotify.imageUrl ||
                updatedData.cover ||
                '/logo.webp',
              thumbnail:
                spotify.thumbnail ||
                spotify.imageUrl ||
                updatedData.thumbnail ||
                updatedData.cover ||
                '/logo.webp',
              previewUrl: spotify.previewUrl,
              formats: updatedData.formats || [],
              audioFormats: updatedData.audioFormats || [],
              isPartial: updatedData.isPartial || false,
              isIsrcMatch: data.isIsrcMatch || false,
              webpageUrl: data.webpageUrl || finalUrl,
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
      setSessionStartTime,
    ]
  );

  return { fetchInfo };
};

/**
 * map and sanitize video metadata
 */
function _mapVideoMetadata(data: VideoInfo, backendUrl: string): VideoInfo {
  const result = { ...data };

  if (result.thumbnail?.includes('localhost:5000')) {
    result.thumbnail = result.thumbnail.replace(
      /http:\/\/localhost:5000/g,
      backendUrl
    );
  }
  if (result.cover?.includes('localhost:5000')) {
    result.cover = result.cover.replace(/http:\/\/localhost:5000/g, backendUrl);
  }

  return result;
}
