// json-block parse; regex stays as fallback

export interface FbRawFormat {
  url: string;
  format_id: string;
  ext: string;
  vcodec?: string;
  acodec?: string;
}

export interface FbJsonResult {
  formats: FbRawFormat[];
  title: string;
  uploader: string;
  thumbnail: string;
}

type Obj = Record<string, unknown>;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

// walk every object node in parsed json
function walk(node: unknown, visit: (obj: Obj) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  visit(node as Obj);
  for (const value of Object.values(node)) walk(value, visit);
}

// pull text/uri from nested {text}/{uri} node
function nestedText(value: unknown, key: 'text' | 'uri'): string | undefined {
  if (value && typeof value === 'object') {
    return str((value as Obj)[key]);
  }
  return undefined;
}

export function extractFromJson(html: string): FbJsonResult | null {
  const blocks = html.matchAll(
    /<script[^>]+type="application\/json"[^>]*>([\s\S]*?)<\/script>/gu
  );

  const formats: FbRawFormat[] = [];
  const seen = new Set<string>();
  let title = '';
  let uploader = '';
  let thumbnail = '';

  const addUrl = (url: string | undefined, id: string) => {
    if (!url || seen.has(url)) return;
    if (formats.some((format) => format.format_id === id)) return;
    seen.add(url);
    formats.push({ url, format_id: id, ext: 'mp4', vcodec: 'h264', acodec: 'aac' });
  };

  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block[1]);
    } catch {
      continue;
    }
    walk(data, (obj) => {
      addUrl(str(obj.browser_native_hd_url) ?? str(obj.playable_url_quality_hd), 'hd');
      addUrl(str(obj.browser_native_sd_url) ?? str(obj.playable_url), 'sd');
      if (!title) title = nestedText(obj.message, 'text') ?? str(obj.video_title) ?? '';
      if (!uploader) {
        const owner = (obj.owner ?? obj.owner_as_page) as Obj | undefined;
        uploader = str(owner?.name) ?? str(obj.ownerName) ?? '';
      }
      if (!thumbnail) {
        const thumb = obj.preferred_thumbnail as Obj | undefined;
        thumbnail = nestedText(thumb?.image, 'uri') ?? '';
      }
    });
  }

  if (formats.length === 0) return null;
  return { formats, title, uploader, thumbnail };
}
