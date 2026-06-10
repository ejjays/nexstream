/**
 * Persists the device's real OPFS write ceiling.
 *
 * navigator.storage.estimate() over-reports on some Android browsers (it claims
 * a multi-GB quota but createSyncAccessHandle writes fail far earlier). When an
 * on-device mux hits that wall we record the byte offset it died at, so future
 * downloads can route oversized files straight to the server instead of wasting
 * a doomed download.
 */
const CEILING_KEY = 'nexstream:emeOpfsCeiling';

// remember the device opfs write ceiling
export function recordOpfsCeiling(bytes: number): void {
  if (typeof localStorage === 'undefined' || bytes <= 0) return;
  try {
    const prev = Number(localStorage.getItem(CEILING_KEY));
    const next =
      Number.isFinite(prev) && prev > 0 ? Math.min(prev, bytes) : bytes;
    localStorage.setItem(CEILING_KEY, String(next));
  } catch {
    // ignore storage write failure
  }
}

export function getOpfsCeiling(): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = Number(localStorage.getItem(CEILING_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}
