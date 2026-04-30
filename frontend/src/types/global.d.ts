export {};

declare global {
  interface Window {
    eruda?: {
      _isInit: boolean;
      show: () => void;
      init: () => void;
    };
    webkitAudioContext: typeof AudioContext;
    chrome?: any;
    onNativePaste?: (text: string) => void;
    onDownloadProgress?: (percentage: number) => void;
    onNativeRefresh?: (text: string) => void;
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}
