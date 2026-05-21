
const getBackendUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  const { hostname, protocol } = globalThis.location || {};

  // Use environment URL only if it's production-ready or we're on localhost
  if (envUrl && (!envUrl.includes('localhost') || hostname === 'localhost')) {
    return envUrl;
  }

  if (typeof globalThis.window === 'undefined') return '';

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.')
  ) {
    return `${protocol}//${hostname}:5000`;
  }

  return `${protocol}//${hostname}`;
};

export const BACKEND_URL = getBackendUrl();

export const getDynamicBackendUrl = async () => {
  try {
    const res = await fetch('/api/get-url').catch(() => null);
    
    if (res && res.ok) {
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (data.url) return data.url;
      }
    }
  } catch (err) {
    // silence discovery errors
  }
  return BACKEND_URL;
};
