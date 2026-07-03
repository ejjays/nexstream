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

export interface PlayerData {
  url: string;
  title: string;
  artist: string;
  cover: string;
  imageUrl?: string;
  previewUrl?: string;
}

export interface ProjectItem extends RemixProject {
  thumbnail?: string;
  isDemo?: boolean;
}

export interface DemoItem {
  id: string;
  name: string;
  isDemo?: boolean;
  thumbnail: string;
  stems: Record<string, string>;
  chordsPath: string;
  artist?: string;
  url?: string;
  cover?: string;
}
