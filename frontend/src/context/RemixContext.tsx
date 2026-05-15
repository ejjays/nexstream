import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useMetronome, MetronomeHook } from '../hooks/useMetronome';
import { useRemixEngine, RemixEngineHook } from '../hooks/useRemixEngine';
import { useRemixStore } from '../store/useRemixStore';

export interface Chord {
  time: number;
  chord: string;
  is_passing?: boolean;
}

export interface RemixContextType extends MetronomeHook, RemixEngineHook {
  stems: Record<string, string> | null;
  setStems: (stems: Record<string, string> | null) => void;
  chords: Chord[];
  setChords: (chords: Chord[]) => void;
  beats: number[];
  setBeats: (beats: number[]) => void;
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
  const [stems, setStems] = useState<Record<string, string> | null>(null);
  const [chords, setChords] = useState<Chord[]>([]);
  const [beats, setBeats] = useState<number[]>([]);
  const [tempo, setTempo] = useState<number>(0);
  const [songName, setSongName] = useState<string>('');
  const [gridShift, setGridShift] = useState<number>(0);
  
  // reset store
  const resetStore = useRemixStore(state => state.resetStore);

  // engine hooks
  const metronome = useMetronome();
  const engine = useRemixEngine(beats as number[], metronome.isMetronome, metronome.playTick, 0);

  const resetProject = React.useCallback(() => {
    engine.stopAll();
    resetStore();
    setStems(null);
    setChords([]);
    setBeats([]);
    setTempo(0);
  }, [engine, resetStore]);

  // provide context
  const value: RemixContextType = React.useMemo(() => ({
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
    resetProject
  }), [
    stems, chords, beats, tempo, songName, gridShift,
    metronome, engine, resetProject
  ]);

  return <RemixContext.Provider value={value}>{children}</RemixContext.Provider>;
};

export const useRemixContext = () => {
  const context = useContext(RemixContext);
  if (!context) throw new Error('useRemixContext must be used within RemixProvider');
  return context;
};
