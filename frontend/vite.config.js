import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import sitemap from "vite-plugin-sitemap";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    sitemap({
      hostname: "https://nex-stream.pages.dev",
      exclude: [
        "/google47cf4c017c18cb87",
        "/google4990a479c64e9cd1",
        "/googleaf6894b78a699043",
      ],
      dynamicRoutes: [
        "/tools/key-changer",
        "/tools/remix-lab",
        "/resources/story",
        "/resources/architecture",
        "/resources/stack",
        "/resources/audio-guide",
        "/resources/video-guide",
        "/resources/security",
        "/resources/remix-guide",
      ],
    }),
  ],
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
});
