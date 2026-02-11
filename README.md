# 🚀 NexStream: AI-Driven Media Engine

**NexStream is a high-performance, ad-free media engine designed for the modern web. It bypasses the limitations of traditional converters using elite streaming pipelines, multi-model AI query reconstruction, and a custom concurrent priority race controller with permanent cloud memory.**

[![SEO: 100/100](https://img.shields.io/badge/SEO-100%2F100-emerald?style=for-the-badge)](https://nexstream.koyeb.app)
[![Performance: Optimized](https://img.shields.io/badge/Performance-Optimized-cyan?style=for-the-badge)](https://nexstream.koyeb.app)
[![Tech: React 19](https://img.shields.io/badge/Frontend-React_19-blue?style=for-the-badge)](https://react.dev)

---

## 🧠 The Architecture: "Superior Intelligence"

NexStream doesn't just search; it **resolves**. When you paste a Spotify link, NexStream initiates a **Parallel Metadata Race** and an **Elite Priority Race**:

1.  **Metadata Race (UI Speed)**: Soundcharts (Professional API) and internal Scrapers fire simultaneously. The first responder immediately hydrates the QualityPicker UI, ensuring sub-1s modal visibility.
2.  **Level 0 (ISRC Gold Standard)**: Soundcharts, Deezer, and iTunes APIs are queried for the exact International Standard Recording Code.
3.  **Level 1 (Aggregator Standard)**: Consults Odesli (Songlink) for verified cross-platform mapping.
4.  **Level 2 (AI Query Architect)**: A tiered AI system (**Llama 3.3 @ Groq** → **Gemini 2.0 Flash**) reconstructs the search query based on duration, artist metadata, and release year.
5.  **Strict ISRC Policy**: To prevent "data poisoning," only ISRC-verified matches are allowed to be saved into the Permanent Brain. AI/Odesli matches are used for immediate downloads but never cached.

---

## ✨ Advanced Features

- ⚡ **The Super Brain (Turso Cloud)**: A permanent, cloud-synced mapping database using Turso (libSQL). Once a song is resolved, it is remembered across all devices and server reboots, resulting in **sub-1s repeat conversion times**.
- 🛠️ **Self-Healing Playback (JIT Refresh)**: Stored preview links (volatile CDN URLs) are automatically refreshed "Just-In-Time" upon retrieval from the Brain. The system races through Spotify, Deezer, and iTunes to ensure the music player never hits a 403 Expired error.
- 🛰️ **Soundcharts Integration**: Professional industry-grade metadata fetching, providing high-accuracy ISRC, official cover art, and deep audio features (BPM, Energy, Key).
- 🧬 **Discography Intelligence Seeder**: A hidden background crawler that can process entire Spotify Artist or Album links, pre-populating the Cloud Brain with verified high-quality matches.
- ⚡ **Elite Streaming Pipeline**: Engineered for free-tier hosting (Koyeb). Pipes data directly from source to user with **zero server-side disk usage** and no timeouts.
- 📟 **Cyberpunk Desktop Terminal**: A professional-grade terminal UI featuring real-time technical logs from `yt-dlp` and `FFmpeg`, now with instant-snap progress for Brain matches.
- 📱 **Mobile Gallery Sync**: Uses fragmented MP4 (fMP4) and Moov Atom optimization to ensure videos are immediately playable in mobile system galleries.
- ⏭️ **Instant Previews**: High-quality audio previews powered by an integrated Spotify/Deezer/iTunes mini-player.

---

## 🛠️ The Elite Stack

### Intelligence & Data
- **Turso (libSQL)**: Edge-hosted permanent cloud memory.
- **Soundcharts API**: Professional music data and ISRC resolution.
- **Llama 3.3 (70B) & Gemini 2.0 Flash**: Advanced LLMs acting as music query architects.
- **Odesli API**: High-speed music link resolution aggregator.

### Frontend (React 19)
- **Vite 7**: Ultra-fast module bundling.
- **Tailwind CSS 4**: Next-gen styling with zero-runtime overhead.
- **Framer Motion 12**: GPU-accelerated fluid UI transitions.
- **Lazy Loading**: Code-split components to minimize main-thread work.

### Backend (Node.js)
- **Express 5**: Modern, scalable middleware architecture.
- **yt-dlp**: The industry standard for low-level media extraction.
- **FFmpeg 8.0**: Essential for stream muxing and lossless metadata injection.
- **SSE (Server-Sent Events)**: Real-time technical log streaming.

---

## 🚀 Deployment & Setup

### Prerequisites
- **Node.js** (v22+)
- **yt-dlp & FFmpeg**: Must be available in the system PATH.
- **Turso Database**: A Turso URL and Auth Token.
- **API Keys**: Google AI Studio, Groq, and Soundcharts.

### Quick Start
```bash
# Clone and install dependencies
git clone https://github.com/ejjays/nexstream.git
cd nexstream && npm install
cd backend && npm install

# Configure Environment
# Create backend/.env with keys for:
# TURSO_URL, TURSO_AUTH_TOKEN, SOUNDCHARTS_APP_ID, SOUNDCHARTS_API_KEY
# GEMINI_API_KEY, GROQ_API_KEY, COOKIES_URL

# Launch Development Environment
npm run dev
```

---

## 📂 System Topology

```bash
nexstream/
├── backend/                # Optimized Node.js Service
│   ├── main.js             # Entry Point (Circuit Breaker & Cleanup)
│   └── src/
│       ├── controllers/    # Intelligence Seeder & Stream Controllers
│       ├── services/       # Priority Race Controller & Cloud Brain Logic
│       └── utils/          # SSE, Cookie, and Format Helpers
├── src/                    # React 19 Frontend
│   ├── components/         # Atomic UI & Responsive Progress Handover
│   └── assets/             # Optimized WebP assets
└── public/                 # PWA Manifest, Robots, & Sitemaps
```

---

*Engineered for speed. Optimized for quality. Powered by Intelligence.*
