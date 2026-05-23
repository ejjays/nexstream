import React, { useState, ReactNode, useCallback } from 'react';
import { useMetronome } from '../hooks/useMetronome';
import { useRemixEngine } from '../hooks/useRemixEngine';
import { useRemixStore } from '../store/useRemixStore';
import { Chord } from '../types/remix';
import { RemixContext, RemixContextType } from './RemixContextInstance';

export const RemixProvider = ({ children }: { children: ReactNode }) => {
  // local state
  const [stems, setStems] = useState<Record<string, string> | null>(null);
  const [chords, setChords] = useState<Chord[]>([]);
  const [beats, setBeats] = useState<number[]>([]);
  const [tempo, setTempo] = useState<number>(0);
  const [songName, setSongName] = useState<string>('');
  const [gridShift, setGridShift] = useState<number>(0);

  // reset store
  const resetStore = useRemixStore((state) => state.resetStore);

  // engine hooks
  const metronome = useMetronome();
  const engine = useRemixEngine(
    beats,
    metronome.isMetronome,
    metronome.playTick,
    gridShift
  );

  const resetProject = useCallback(() => {
    engine.stopAll();
    resetStore();
    setStems(null);
    setChords([]);
    setBeats([]);
    setTempo(0);
  }, [engine, resetStore]);

  // provide context
  const value: RemixContextType = React.useMemo(
    () => ({
      // song metadata
      stems,
      setStems,
      chords,
      setChords,
      beats,
      setBeats,
      tempo,
      setTempo,
      songName,
      setSongName,
      gridShift,
      setGridShift,

      // metronome state
      ...metronome,

      // engine actions
      ...engine,

      // reset helper
      resetProject,
    }),
    [
      stems,
      chords,
      beats,
      tempo,
      songName,
      gridShift,
      metronome,
      engine,
      resetProject,
    ]
  );

  return (
    <RemixContext.Provider value={value}>{children}</RemixContext.Provider>
  );
};
