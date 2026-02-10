# 🚀 NexStream: AI-Driven Media Engine

**NexStream is a high-performance, ad-free media engine designed for the modern web. It bypasses the limitations of traditional converters using elite streaming pipelines, multi-model AI query reconstruction, and a custom concurrent priority race controller.**

[![SEO: 100/100](https://img.shields.io/badge/SEO-100%2F100-emerald?style=for-the-badge)](https://nexstream.koyeb.app)
[![Performance: Optimized](https://img.shields.io/badge/Performance-Optimized-cyan?style=for-the-badge)](https://nexstream.koyeb.app)
[![Tech: React 19](https://img.shields.io/badge/Frontend-React_19-blue?style=for-the-badge)](https://react.dev)

---

## 🧠 The Architecture: "Balanced Accuracy"

NexStream doesn't just search; it **resolves**. When you paste a Spotify link, NexStream initiates an **Elite Priority Race**:

1.  **Level 0 (ISRC Gold Standard)**: Hits Deezer and iTunes APIs simultaneously to find the exact International Standard Recording Code.
2.  **Level 1 (Aggregator Standard)**: Consults Odesli (Songlink) for verified cross-platform mapping.
3.  **Level 2 (AI Query Architect)**: If APIs fail, a tiered AI system (**Llama 3.3 @ Groq** → **Gemini 3 Flash**) reconstructs the search query based on duration, artist metadata, and release year.
4.  **The Race Controller**: A custom logic engine uses a "Grace Window" to ensure high-fidelity matches (ISRC) win even if fuzzy matches (AI) finish faster.

---

## ✨ Advanced Features

- ⚡ **Elite Streaming Pipeline**: Engineered for free-tier hosting (Koyeb/Render). Pipes data directly from source to user with **zero server-side disk usage** and no timeouts, supporting 1GB+ files.
- 📟 **Cyberpunk Desktop Terminal**: A professional-grade terminal UI for desktop users, featuring real-time technical logs from `yt-dlp` and `FFmpeg`.
- 🖼️ **WebP Asset Pipeline**: 92% reduction in payload size using high-performance WebP assets and manual preloading for near-instant Largest Contentful Paint (LCP).
- 🔍 **100/100 Technical SEO**: Built with **React 19 native metadata hoisting**, JSON-LD structured data, and an automated sitemap/robots discovery system.
- 📱 **Mobile Gallery Sync**: Uses fragmented MP4 (fMP4) and Moov Atom optimization to ensure videos are immediately playable in mobile system galleries.
- 🎵 **Studio-Grade Metadata**: Aggressive Cheerio-based scrapers prioritize official 640x640 Spotify cover art and inject ID3v2 tags directly into the stream using `-c copy` technology.
- ⏭️ **Instant Previews**: 30-second high-quality audio previews powered by an integrated Spotify/Deezer mini-player.

---

## 🛠️ The Elite Stack

### Intelligence
- **Llama 3.3 (70B) & Gemini 3 Flash**: Advanced LLMs acting as music query architects.
- **Odesli API**: High-speed music link resolution aggregator.

### Frontend (React 19)
- **Vite 7**: Ultra-fast module bundling.
- **Tailwind CSS 4**: Next-gen styling with zero-runtime overhead.
- **Framer Motion 12**: GPU-accelerated fluid UI transitions.
- **Lazy Loading**: Modal and player components are code-split to minimize main-thread work.

### Backend (Node.js)
- **Express 5**: Modern, scalable middleware architecture.
- **yt-dlp**: The industry standard for low-level media extraction.
- **FFmpeg**: Essential for stream muxing and lossless metadata injection.
- **SSE (Server-Sent Events)**: Real-time technical log streaming to the frontend.

---

## 🚀 Deployment & Setup

### Prerequisites
- **Node.js** (v20+)
- **yt-dlp & FFmpeg**: Must be available in the system PATH.
- **API Keys**: Google AI Studio (Gemini) or Groq.

### Quick Start
```bash
# Clone and install dependencies
git clone https://github.com/ejjays/nexstream.git
cd nexstream && npm install
cd backend && npm install

# Launch Development Environment
# Root: Vite Frontend
npm run dev
# Backend: Express Server
npm start
```

---

## 📂 System Topology

```bash
nexstream/
├── backend/                # Optimized Node.js Service
│   ├── main.js             # Entry Point (Circuit Breaker & Cleanup)
│   └── src/
│       ├── services/       # Priority Race Controller & AI Logic
│       └── utils/          # SSE, Cookie, and Format Helpers
├── src/                    # React 19 Frontend
│   ├── components/         # Atomic UI & Desktop Terminal
│   └── assets/             # Optimized WebP assets
└── public/                 # PWA Manifest, Robots, & Sitemaps
```

---

*Engineered for speed. Optimized for quality. Powered by Intelligence.*
