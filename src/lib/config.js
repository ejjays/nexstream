export const BACKEND_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? `http://${window.location.hostname}:8000` : window.location.origin);
