// one resolved media (carousel child or single)
export interface IgMedia {
  url: string;
  isVideo: boolean;
  width?: number;
  height?: number;
}

// normalized shape across all fetch paths
export interface IgParsed {
  id: string | null;
  title: string;
  uploader: string;
  thumbnail?: string;
  media: IgMedia[];
}
