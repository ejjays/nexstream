# NexStream: Media Orchestration Engine

**NexStream is an edge-native media bridge designed to bypass the limitations of traditional media pipelines. It orchestrates WebAssembly to mux high-fidelity streams directly in the browser and LLMs for semantic search, delivering high-quality media resolution without the overhead of legacy converter stacks.**

[![SEO: 100/100](https://img.shields.io/badge/SEO-100%2F100-emerald?style=for-the-badge)](https://ej-nexstream.vercel.app)
[![Quality Gate](https://img.shields.io/sonar/quality_gate/ejjays_nexstream?server=https%3A%2F%2Fsonarcloud.io&style=for-the-badge)](https://sonarcloud.io/summary/new_code?id=ejjays_nexstream)
[![Performance: Optimized](https://img.shields.io/badge/Performance-Optimized-cyan?style=for-the-badge)](https://ej-nexstream.vercel.app)
[![Tech: React 19](https://img.shields.io/badge/Frontend-React_19-blue?style=for-the-badge)](https://react.dev)

---

## ⚡ Why NexStream?

Traditional media converters have a fatal flaw: **Server-Side Bottlenecks.**
Muxing 4K video on a backend server kills CPU and Disk I/O, creating a problem that requires expensive hardware.

**NexStream implements a Hybrid Approach**

1.  **Edge-First Muxing:** For high-resolution video (1080p/4K), the backend only resolves the manifest. Your browser (via WebAssembly/LibAV) downloads raw streams and stitches them locally.
2.  **Anti-Throttle Tunneling:** To bypass YouTube's 30KB/s bot-detection throttle, NexStream uses a direct `yt-dlp` backend proxy. This tunnels cryptographically verified streams to the browser at 15MB/s+, ensuring the Edge Muxer is never starved for data.
3.  **Smart Hybrid Routing:** An intelligent decision engine analyzes file size before processing. Files under **400MB** use ultra-fast Edge Muxing to save server bandwidth, while larger files automatically fallback to the **Server-Side Turbo Engine** to prevent mobile RAM exhaustion.
4.  **Service Worker Pipe:** NexStream uses a custom Service Worker to pipe WASM output directly to the browser's download manager, enabling multi-gigabyte exports without memory exhaustion.

---

## 🧠 Technical Architecture: The "Parallel Race"

NexStream is a multi-layered concurrency model to ensure metadata integrity and accuracy. We don't just "search" for a song; we race multiple engines to find the _perfect_ match in sub-seconds.

### 1. Asynchronous Hydration & Race Conditions

The resolution pipeline is built for perceived zero-latency. As soon as any engine identifies the track's metadata (title, artist, cover), it triggers an **Early Dispatch** via Server-Sent Events (SSE) to hydrate the UI instantly while the race still proccessing in the background.

- **Level 0 - Authoritative (T+0ms):** Queries **Soundcharts**, **Deezer**, and **iTunes** for ISRC-verified metadata.
- **Level 1 - Aggregation (T+1500ms):** Consults **Odesli (Songlink)** for verified cross-platform manifest mappings.
- **Level 2 - AI Synthesis (T+6000ms):** If strict matches fail, **Llama 3.3** and **Gemini 2.5** synthesize a high-precision search query based on acoustic signatures and duration.

**Prioritized Settlement:** To ensure maximum accuracy, the engine implements a staggered grace period. While fuzzy matches are held for up to 15 seconds, the system will settle immediately if a Level 0 authoritative result is found, ensuring you get the "Perfect match" rather than a "live" or "cover" version.

### 2. Global Edge Registry (Turso)

We don't cache files; we cache _intelligence_.

- **Persistent Mapping:** Once a track is resolved (e.g., "Spotify ID X" = "YouTube Video Y"), the mapping is stored in a distributed **Turso (libSQL)** database.
- **Cache Integrity:** Only ISRC-verified matches are persisted to the Global Registry to prevent inaccurate results on the database with bad metadata.

---

## 🛠️ Core Capabilities

- **Edge Muxing Engine (EME)**: Offloads high-bandwidth media processing to the client's browser via `LibAV.wasm`. Implements zero-CPU stream copying for resolutions up to 1080p/4K.
- **Intelligence Seeder**: A background engine that can batch-resolve entire Spotify albums or artist catalogs, pre-populating the Global Edge Registry for sub-second user hits.
- **Service Worker Data Pump**: Bypasses the 2GB "Blob" limit in modern browsers by streaming binary chunks from WASM memory to the filesystem in real-time using custom Service Worker pipes.
- **JIT Playback Refresh**: Volatile CDN links expire. NexStream automatically refreshes these links upon retrieval from the registry by racing through provider endpoints, preventing 403 Forbidden errors.
- **Precision Metadata Fetching**: Deep integration with industry-standard music APIs to retrieve official cover art, high-accuracy ISRC, and acoustic features.
- **Zero-Disk Streaming Pipeline**: Built for stateless hosting environments. Pipes media data directly from source to client using memory-only buffers to eliminate disk I/O bottlenecks.
- **Technical Telemetry Terminal**: A terminal-class interface providing real-time logs from `yt-dlp` and `FFmpeg` via Server-Sent Events (SSE).

---

## 💻 Technical Stack

### Intelligence & Data

- **Turso (libSQL)**: Edge-hosted persistent registry.
- **Authoritative Data Nodes**: Deep integration with **Soundcharts**, **Deezer** and **iTunes** for ISRC-verified metadata resolution.
- **Odesli API**: High-speed manifest resolution and platform bridging.
- **Llama 3.3 & Gemini 2.5**: LLMs utilized for semantic query synthesis.

### Frontend Architecture

- **React 19**: Concurrent rendering core for fluid UI responsiveness.
- **Service Workers**: Dedicated threads for high-performance binary streaming and non-blocking downloads.
- **Vite 7**: Optimized module bundling and hot module replacement.
- **Tailwind CSS 4**: Zero-runtime CSS orchestration.
- **LibAV.wasm**: Low-level media remuxing engine optimized for the browser.

### Backend Infrastructure

- **Node.js (Express 5)**: Scalable middleware and stream orchestration.
- **Termux**: Optimized for native Android hosting and development environments.
- **yt-dlp**: Low-level media manifest resolution.
- **FFmpeg 7.x/8.x**: Real-time stream muxing and metadata injection.
- **Server-Sent Events (SSE)**: Real-time backend-to-frontend telemetry.

---

## 🚀 Deployment & Provisioning

### Native Android (Termux)

_NexStream is optimized to run directly on your phone._

```bash
# Automated Provisioning (System Update + Dependencies + Build)
curl -sL https://raw.githubusercontent.com/ejjays/nexstream/main/scripts/termux-install.sh | bash
```

### Standard Deployment

1.  **Provision repository and dependencies**

    ```bash
    git clone https://github.com/ejjays/nexstream.git
    cd nexstream && npm install
    cd backend && npm install
    ```

2.  **Initialize Environment**
    Configure `backend/.env` with: `TURSO_URL`, `TURSO_AUTH_TOKEN`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `COOKIES_URL`.

3.  **Start Development Environment**
    ```bash
    npm run dev
    ```

---

## 📱 Mobile Architecture (Expo)

The `/mobile` directory contains an experimental React Native implementation designed to bypass mobile browser limitations.

- **WebView Bridge**: Intercepts download triggers from the frontend.
- **Storage Access Framework (SAF)**: Uses native Android APIs to save files directly to the user's file system, bypassing the "blob" storage limits of mobile Chrome.

---

## 🗺️ System Topology

```bash
nexstream/
├── backend/                # Stream Orchestration & API Services
│   ├── src/
│   │   ├── app.js          # Entry point (Main Server Logic)
│   │   ├── services/       # The "Brain" (Spotify/Youtube Resolvers)
│   │   └── routes/         # Video & Media Route Definitions
├── frontend/               # React 19 SPA (Vite Architecture)
│   ├── src/
│   │   ├── lib/            # Wasm/Muxer Logic (The heavy lifting)
│   │   ├── components/     # UI Component Library (Atomized)
│   │   └── pages/          # Technical Resource Center
├── mobile/                 # Experimental Mobile Core (Expo)
├── scripts/                # Utility & Deployment Scripts
└── public/                 # PWA & SEO Assets
```

---

## ⚖️ Disclaimer

NexStream is for educational and research purposes. Please use it responsibly and only for content you have the legal right to process. No piracy—keep it fair.

---

### Support the Journey

I built NexStream entirely on my phone because I don't have a computer yet. My goal is to keep high-quality tools like this free and ad-free for everyone. If this project helped you out, you can support my work here it'll mean the world to me:

<p align="left">
  <a href="https://www.buymeacoffee.com/ejjays">
    <img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-orange?style=for-the-badge&logo=buy-me-a-coffee" />
  </a>
</p>
