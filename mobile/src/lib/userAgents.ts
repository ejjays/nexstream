// single source for browser UA strings — rotate fingerprint here, not per-extractor.
// youtube internal UA pinned separately: rides youtubei.js/googlevideo fetches
// (webview strips youtubei's own UA) — change only alongside a device test.

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const YT_INTERNAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
