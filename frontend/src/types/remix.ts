export interface ProjectItem {
  id: string;
  name: string;
  date?: string;
  stems?: Record<string, string>;
  chords?: unknown[];
  beats?: unknown[];
  tempo?: number;
  engine?: string;
  isDemo?: boolean;
}

export interface DemoItem {
  id: string;
  name: string;
  thumbnail?: string;
  stems: Record<string, string>;
  chordsPath: string;
  isDemo: boolean;
}
