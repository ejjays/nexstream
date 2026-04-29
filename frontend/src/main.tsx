// @ts-nocheck
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

let refreshing = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // console.log("Service Worker controller changed, skipping auto-reload");
    /*
    if (!refreshing && navigator.serviceWorker.controller) {
      globalThis.location.reload();
      refreshing = true;
    }
    */
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
