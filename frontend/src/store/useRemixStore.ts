import { create } from 'zustand';

export interface RemixState {
  // app core state
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  currentBeatIdx: number;
  beatFlash: boolean;
  isReady: boolean;
  backendUrl: string;
  url: string;
  loading: boolean;
  error: string;
  selectedFormat: string;
  videoTitle: string;
  showPlayer: boolean;
  playerData: any;
  clientId: string;

  // sse stream state
  status: string;
  subStatus: string;
  progress: number;
  targetProgress: number;
  desktopLogs: any[];
  sessionStartTime: number | null;
  pendingSubStatuses: any[];
  videoData: any;
  isPickerOpen: boolean;
  volumes: {
    vocals: number;
    drums: number;
    bass: number;
    guitar: number;
    piano: number;
    other: number;
  };

  // state update helpers
  setSessionStartTime: (time: number | null) => void;
  setUrl: (url: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setSelectedFormat: (format: string) => void;
  setVideoTitle: (title: string) => void;
  setShowPlayer: (show: boolean) => void;
  setPlayerData: (data: any) => void;
  setVideoData: (updater: any) => void;
  setIsPickerOpen: (open: boolean) => void;
  setClientId: (id: string) => void;
  setStatus: (status: string) => void;
  setSubStatus: (subStatus: string) => void;
  setProgress: (updater: number | ((prev: number) => number)) => void;
  setTargetProgress: (updater: number | ((prev: number) => number)) => void;
  setDesktopLogs: (updater: any[] | ((prev: any[]) => any[])) => void;
  setPendingSubStatuses: (updater: any[] | ((prev: any[]) => any[])) => void;
  setBackendUrl: (url: string) => void;
  setIsPlaying: (playing: boolean) => void;
  setDuration: (dur: number) => void;
  setCurrentTime: (time: number) => void;
  setCurrentBeatIdx: (idx: number) => void;
  setBeatFlash: (flash: boolean) => void;
  setIsReady: (ready: boolean) => void;
  setVolume: (track: string, val: number) => void;
  resetStore: () => void;
}

export const useRemixStore = create<RemixState>((set) => ({
  // app core state
  isPlaying: false,
  duration: 0,
  currentTime: 0,
  currentBeatIdx: -1,
  beatFlash: false,
  isReady: false,
  backendUrl: '',
  url: '',
  loading: false,
  error: '',
  selectedFormat: 'mp4',
  videoTitle: '',
  showPlayer: false,
  playerData: null,
  clientId: (() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('nexstream_client_id') : null;
    if (saved) return saved;
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID().split('-')[0] 
      : Math.random().toString(36).substring(2, 10);
    if (typeof window !== 'undefined') localStorage.setItem('nexstream_client_id', newId);
    return newId;
  })(),

  // sse stream state
  status: 'idle',
  subStatus: '',
  progress: 0,
  targetProgress: 0,
  desktopLogs: [],
  sessionStartTime: null,
  pendingSubStatuses: [],
  videoData: null,
  isPickerOpen: false,
  volumes: {
    vocals: 1,
    drums: 1,
    bass: 1,
    guitar: 1,
    piano: 1,
    other: 1
  },

  // state update helpers
  setSessionStartTime: (time) => set({ sessionStartTime: time }),
  setUrl: (url) => set({ url }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSelectedFormat: (selectedFormat) => set({ selectedFormat }),
  setVideoTitle: (videoTitle) => set({ videoTitle }),
  setShowPlayer: (showPlayer) => set({ showPlayer }),
  setPlayerData: (playerData) => set({ playerData }),
  setVideoData: (updater) => set((state) => ({
    videoData: typeof updater === 'function' ? updater(state.videoData) : updater
  })),
  setIsPickerOpen: (open) => set({ isPickerOpen: open }),
  setClientId: (id) => set({ clientId: id }),
  setStatus: (status) => set({ status }),
  setSubStatus: (subStatus) => set({ subStatus }),
  setProgress: (updater) => set((state) => {
    const nextVal = typeof updater === 'function' ? (updater as any)(state.progress) : updater;
    const numeric = Number(nextVal);
    if (isNaN(numeric)) return state;
    return { progress: numeric };
  }),
  setTargetProgress: (updater) => set((state) => {
    const nextVal = typeof updater === 'function' ? (updater as any)(state.targetProgress) : updater;
    const numeric = Number(nextVal);
    if (isNaN(numeric)) return state;
    return { targetProgress: numeric };
  }),
  setDesktopLogs: (updater) => set((state) => ({ 
    desktopLogs: typeof updater === 'function' ? updater(state.desktopLogs) : updater 
  })),
  setPendingSubStatuses: (updater) => set((state) => ({ 
    pendingSubStatuses: typeof updater === 'function' ? updater(state.pendingSubStatuses) : updater 
  })),

  setBackendUrl: (url) => set({ backendUrl: url }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setDuration: (dur) => set({ duration: dur }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setCurrentBeatIdx: (idx) => set({ currentBeatIdx: idx }),
  setBeatFlash: (flash) => set({ beatFlash: flash }),
  setIsReady: (ready) => set({ isReady: ready }),
  
  setVolume: (track, val) => set((state) => ({
    volumes: { ...state.volumes, [track as keyof typeof state.volumes]: val }
  })),

  // reset all state
  resetStore: () => set({
    isPlaying: false,
    duration: 0,
    currentTime: 0,
    currentBeatIdx: -1,
    beatFlash: false,
    isReady: false,
    volumes: {
      vocals: 1,
      drums: 1,
      bass: 1,
      guitar: 1,
      piano: 1,
      other: 1
    }
  })
}));
