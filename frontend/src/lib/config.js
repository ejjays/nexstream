const getBackendUrl = () => {
  if (typeof globalThis.window === 'undefined') return 'http://localhost:5000';
  const { hostname, protocol } = globalThis.location;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
    const targetHost = hostname === 'localhost' ? '127.0.0.1' : hostname;
    return `${protocol}//${targetHost}:5000`;
  }
  
  return 'https://ej-nexstream.koyeb.app';
};

export const BACKEND_URL = getBackendUrl();