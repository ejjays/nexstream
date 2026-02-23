import { useEffect, useLayoutEffect } from "react";

export const useNativeBridge = ({
  setUrl,
  setLoading,
  setError,
  setProgress,
  setTargetProgress,
  setStatus,
  setSubStatus,
  setDesktopLogs,
  setPendingSubStatuses,
  setVideoTitle,
  setIsPickerOpen,
  setVideoData,
  setIsSpotifySession,
  setShowPlayer,
  setPlayerData,
  isPickerOpen,
}) => {
  useEffect(() => {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "SET_REFRESH_ENABLED",
          payload: !isPickerOpen,
        }),
      );
    }
  }, [isPickerOpen]);

  useLayoutEffect(() => {
    window.onNativePaste = (text) => {
      if (text) setUrl(text);
    };

    window.onDownloadProgress = (percentage) => {
      if (percentage !== undefined) {
        setProgress(percentage);
        setTargetProgress(percentage);
        if (percentage === 100) {
          setTimeout(() => {
            setLoading(false);
            setStatus("completed");
          }, 1000);
        }
      }
    };

    window.onNativeRefresh = () => {
      setUrl("");
      setLoading(false);
      setError("");
      setProgress(0);
      setTargetProgress(0);
      setStatus("");
      setSubStatus("");
      setDesktopLogs([]);
      setPendingSubStatuses([]);
      setVideoTitle("");
      setIsPickerOpen(false);
      setVideoData(null);
      setIsSpotifySession(false);
      setShowPlayer(false);
      setPlayerData(null);
    };
  }, [
    setUrl,
    setLoading,
    setError,
    setProgress,
    setTargetProgress,
    setStatus,
    setSubStatus,
    setDesktopLogs,
    setPendingSubStatuses,
    setVideoTitle,
    setIsPickerOpen,
    setVideoData,
    setIsSpotifySession,
    setShowPlayer,
    setPlayerData,
  ]);

  const requestClipboard = () => {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "REQUEST_CLIPBOARD",
        }),
      );
      return true;
    }
    return false;
  };

  const triggerMobileDownload = (payload) => {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "DOWNLOAD_FILE",
          payload,
        }),
      );
      return true;
    }
    return false;
  };

  return { requestClipboard, triggerMobileDownload };
};
