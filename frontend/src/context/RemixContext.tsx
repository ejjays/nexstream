// @ts-nocheck
import React, { createContext, useContext, useState, useRef } from 'react';
import { useMetronome } from '../hooks/useMetronome';
import { useRemixEngine } from '../hooks/useRemixEngine';
import { useRemixStore } from '../store/useRemixStore';

const RemixContext = createContext();

export const RemixProvider = ({ children }) => {
  // local state
  const [stems, setStems] = useState(null);
  const [chords, setChords] = useState([]);
  const [beats, setBeats] = useState([]);
  const [tempo, setTempo] = useState(0);
  const [songName, setSongName] = useState('');
  const [gridShift, setGridShift] = useState(0);
  
  // reset store
  const resetStore = useRemixStore(state => state.resetStore);

  // engine hooks
  const metronome = useMetronome();
  const engine = useRemixEngine(beats, metronome.isMetronome, metronome.playTick, 0);

  // provide context
  const value = {
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
