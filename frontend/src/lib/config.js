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
    const res = await fetch('/api/get-url');
    const data = await res.json();
    if (data.url) return data.url;
  } catch (err) {
    console.error('Failed to fetch dynamic backend URL:', err);
  }
  return BACKEND_URL;
};
