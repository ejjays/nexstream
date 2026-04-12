import { create } from 'zustand';

export const useRemixStore = create((set) => ({
  // playback state
  isPlaying: false,
  duration: 0,
  currentTime: 0,
  currentBeatIdx: -1,
  beatFlash: false,
  isReady: false,
  backendUrl: '',
  
  // mixer state
  volumes: {
    vocals: 1,
    drums: 1,
    bass: 1,
    other: 1,
    guitar: 1,
    piano: 1
  },

  // store setters
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

  // reset helper
  resetStore: () => set({
    isPlaying: false,
    duration: 0,
    currentTime: 0,
    currentBeatIdx: -1,
    beatFlash: false,
    isReady: false
  })
}));
