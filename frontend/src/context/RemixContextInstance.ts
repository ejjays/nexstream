import { createContext } from 'react';
import { MetronomeHook } from '../hooks/useMetronome';
import { RemixEngineHook } from '../hooks/useRemixEngine';
import { Chord } from '../types/remix';

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

export const RemixContext = createContext<RemixContextType | null>(null);
