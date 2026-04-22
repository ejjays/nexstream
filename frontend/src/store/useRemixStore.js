import { create } from 'zustand';

export const useRemixStore = create((set) => ({
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
    const nextVal = typeof updater === 'function' ? updater(state.progress) : updater;
    const numeric = Number(nextVal);
    if (isNaN(numeric)) return state;
    return { progress: numeric };
  }),
  setTargetProgress: (updater) => set((state) => {
    const nextVal = typeof updater === 'function' ? updater(state.targetProgress) : updater;
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
    volumes: { ...state.volumes, [track]: val }
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
