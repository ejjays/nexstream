import { useEffect, useLayoutEffect, useRef } from "react";

interface NativeBridgeProps {
  setUrl: (url: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setProgress: (progress: number) => void;
  setTargetProgress: (progress: number) => void;
  setStatus: (status: string) => void;
  setSubStatus: (subStatus: string) => void;
  setDesktopLogs: (logs: any[]) => void;
  setPendingSubStatuses: (statuses: any[]) => void;
  setVideoTitle: (title: string) => void;
  setIsPickerOpen: (open: boolean) => void;
  setVideoData: (data: any) => void;
  setShowPlayer: (show: boolean) => void;
  setPlayerData: (data: any) => void;
  isPickerOpen: boolean;
  setIsSpotifySession?: (isSpotify: boolean) => void;
}

export const useNativeBridge = (props: NativeBridgeProps) => {
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
    window.onNativePaste = (text: string) => {
      if (text) propsRef.current.setUrl(text);
    };

    window.onDownloadProgress = (percentage: number) => {
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
  }, []);

  const requestClipboard = (): boolean => {
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

  const triggerMobileDownload = (payload: any): boolean => {
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
