// shared contract across parse + normalize

// snake_case mirrors threads/ig wire keys
export interface ThreadsRawFormat {
  url: string;
  format_id?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  width?: number;
  height?: number;
}

// parsed media and page meta
export interface ThreadsParsed {
  id: string | null;
  title: string;
  uploader: string;
  thumbnail: string;
  formats: ThreadsRawFormat[];
}
