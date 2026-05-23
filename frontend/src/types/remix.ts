export interface Chord {
  time: number;
  chord: string;
  is_passing?: boolean;
}

export interface RemixProject {
  id: string;
  name: string;
  stems: Record<string, string>;
  chords: Chord[];
  beats: number[];
  tempo: number;
  engine: string;
  date: string;
}
