export const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" 
    ? (window.location.hostname === "localhost" ? "http://localhost:5000" : "https://ej-nexstream.koyeb.app")
    : "https://ej-nexstream.koyeb.app");