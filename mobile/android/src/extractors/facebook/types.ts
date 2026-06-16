// shared contract across parse + normalize

// snake_case mirrors fb wire keys
export interface FbRawFormat {
  url: string;
  format_id?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
}

// parsed media and page meta
export interface FbParsed {
  id: string | null;
  title: string;
  uploader: string;
  thumbnail: string;
  formats: FbRawFormat[];
}
