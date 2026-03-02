const getBackendUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof globalThis.window === 'undefined') return 'http://localhost:5000';
  const { hostname, protocol } = globalThis.location;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
    const targetHost = hostname === 'localhost' ? '127.0.0.1' : hostname;
    return `${protocol}//${targetHost}:5000`;
  }
  
  return 'https://ejjays-nexstream-backend.hf.space';
};

export const BACKEND_URL = getBackendUrl();