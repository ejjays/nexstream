
const getBackendUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof globalThis.window === 'undefined') return 'http://localhost:5000';
  const { hostname, protocol } = globalThis.location;

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.')
  ) {
    const targetHost = hostname === 'localhost' ? '127.0.0.1' : hostname;
    return `${protocol}//${targetHost}:5000`;
  }

  return `${protocol}//${hostname}${protocol === 'http:' ? ':5000' : ''}`;
};

export const BACKEND_URL = getBackendUrl();

export const getDynamicBackendUrl = async () => {
  try {
    let res = await fetch('/api/get-url');
    
    if (!res.ok) {
       res = await fetch('http://localhost:5000/api/get-url');
    }

    const contentType = res.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await res.json();
        if (data.url) {
            console.log('[discovery] url found:', data.url);
            return data.url;
        }
    }
  } catch (err) {
    console.warn('[discovery] fetch failed:', err);
  }
  console.log('[discovery] using default:', BACKEND_URL);
  return BACKEND_URL;
};
