export const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://spikier-acinaceous-keenan.ngrok-free.dev");