import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useMetronome, MetronomeHook } from '../hooks/useMetronome';
import { useRemixEngine, RemixEngineHook } from '../hooks/useRemixEngine';
import { useRemixStore } from '../store/useRemixStore';

export interface RemixContextType extends MetronomeHook, RemixEngineHook {
  stems: any;
  setStems: (stems: any) => void;
  chords: any[];
  setChords: (chords: any[]) => void;
  beats: any[];
  setBeats: (beats: any[]) => void;
  tempo: number;
  setTempo: (tempo: number) => void;
  songName: string;
  setSongName: (name: string) => void;
  gridShift: number;
  setGridShift: (shift: number) => void;
  resetProject: () => void;
}

const RemixContext = createContext<RemixContextType | null>(null);

export const RemixProvider = ({ children }: { children: ReactNode }) => {
  // local state
  const [stems, setStems] = useState<any>(null);
  const [chords, setChords] = useState<any[]>([]);
  const [beats, setBeats] = useState<any[]>([]);
  const [tempo, setTempo] = useState<number>(0);
  const [songName, setSongName] = useState<string>('');
  const [gridShift, setGridShift] = useState<number>(0);
  
  // reset store
  const resetStore = useRemixStore(state => state.resetStore);

  // engine hooks
  const metronome = useMetronome();
  const engine = useRemixEngine(beats, metronome.isMetronome, metronome.playTick, 0);

  // provide context
  const value: RemixContextType = {
    // song metadata
    stems, setStems,
    chords, setChords,
    beats, setBeats,
    tempo, setTempo,
    songName, setSongName,
    gridShift, setGridShift,
    
    // metronome state
    ...metronome,
    
    // engine actions
    ...engine,
    
    // reset helper
    resetProject: () => {
      engine.stopAll();
      resetStore();
      setStems(null);
      setChords([]);
      setBeats([]);
      setTempo(0);
    }
  };

  return <RemixContext.Provider value={value}>{children}</RemixContext.Provider>;
};

export const useRemixContext = () => {
  const context = useContext(RemixContext);
  if (!context) throw new Error('useRemixContext must be used within RemixProvider');
  return context;
};
