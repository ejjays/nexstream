import { useEffect, useLayoutEffect, useRef } from "react";

export const useNativeBridge = (props) => {
  // Use a ref to always have the latest props without triggering re-runs
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "SET_REFRESH_ENABLED",
          payload: !props.isPickerOpen,
        }),
      );
    }
  }, [props.isPickerOpen]);

  useLayoutEffect(() => {
    window.onNativePaste = (text) => {
      if (text) propsRef.current.setUrl(text);
    };

    window.onDownloadProgress = (percentage) => {
      if (percentage !== undefined) {
        propsRef.current.setProgress(percentage);
        propsRef.current.setTargetProgress(percentage);
        if (percentage === 100) {
          setTimeout(() => {
            propsRef.current.setLoading(false);
            propsRef.current.setStatus("completed");
          }, 1000);
        }
      }
    };

    window.onNativeRefresh = () => {
      const p = propsRef.current;
      p.setUrl("");
      p.setLoading(false);
      p.setError("");
      p.setProgress(0);
      p.setTargetProgress(0);
      p.setStatus("");
      p.setSubStatus("");
      if (p.setDesktopLogs) p.setDesktopLogs([]);
      if (p.setPendingSubStatuses) p.setPendingSubStatuses([]);
      if (p.setVideoTitle) p.setVideoTitle("");
      if (p.setIsPickerOpen) p.setIsPickerOpen(false);
      if (p.setVideoData) p.setVideoData(null);
      if (p.setIsSpotifySession) p.setIsSpotifySession(false);
      if (p.setShowPlayer) p.setShowPlayer(false);
      if (p.setPlayerData) p.setPlayerData(null);
    };
  }, []); // Only run once

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
