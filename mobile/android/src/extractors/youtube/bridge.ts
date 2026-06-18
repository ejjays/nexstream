export interface RawYtFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  qualityLabel?: string;
  hasAudio?: boolean;
  hasVideo?: boolean;
  contentLength?: string;
  audioQuality?: string;
  language?: string;
  isOriginal?: boolean;
}

export interface RawYtResult {
  id: string;
  title?: string;
  author?: string;
  duration?: number;
  thumbnail?: string;
  client?: string;
  poToken?: boolean;
  formats: RawYtFormat[];
  adaptive: RawYtFormat[];
}

export interface RawYtMeta {
  id: string;
  title?: string;
  author?: string;
  duration?: number;
  thumbnail?: string;
}

type Injector = (js: string) => void;
type Resolver = (value: RawYtResult | null) => void;
type PartialHandler = (meta: RawYtMeta) => void;

let inject: Injector | null = null;
let ready = false;
const queue: string[] = [];
const pending = new Map<
  string,
  { resolve: Resolver; onPartial?: PartialHandler; timer: ReturnType<typeof setTimeout> }
>();

export function attachWebView(injectFn: Injector): void {
  inject = injectFn;
}

function flush(): void {
  while (queue.length > 0) {
    const js = queue.shift();
    if (js) inject?.(js);
  }
}

export function onWebViewMessage(raw: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.log) {
    console.log(`[JS-YT/wv] ${msg.stage}: ${msg.detail}`);
    return;
  }
  if (msg.ready) {
    ready = true;
    flush();
    return;
  }

  const reqId = msg.reqId as string | undefined;
  if (!reqId) return;
  const entry = pending.get(reqId);
  if (!entry) return;

  if (msg.partial) {
    entry.onPartial?.(msg.meta as RawYtMeta);
    return;
  }

  clearTimeout(entry.timer);
  pending.delete(reqId);

  if (msg.ok) {
    entry.resolve(msg.data as RawYtResult);
  } else {
    console.warn(`[JS-YT/wv] extract failed: ${msg.error}`);
    entry.resolve(null);
  }
}

export function extractViaWebView(
  videoId: string,
  onPartial?: PartialHandler
): Promise<RawYtResult | null> {
  return new Promise((resolve) => {
    if (!inject) {
      resolve(null);
      return;
    }
    const reqId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => {
      pending.delete(reqId);
      console.warn('[JS-YT/wv] extract timed out');
      resolve(null);
    }, 45000);
    pending.set(reqId, { resolve, onPartial, timer });

    const js = `window.__extract(${JSON.stringify(reqId)}, ${JSON.stringify(videoId)}); true;`;
    if (ready) inject(js);
    else queue.push(js);
  });
}
