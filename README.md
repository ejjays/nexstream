# NexStream: Media Orchestration Engine

**Built for musicians, creators, and power users who need professional-grade tools without the premium price tag.**

Whether you are downloading high-fidelity 4K+ video or deconstructing a song into individual stems and chords for practice, NexStream delivers the power of expensive subscription-based apps entirely for free. By moving heavy media processing away from slow servers and directly onto your device—and utilizing AI for deep music analysis—NexStream bypasses traditional bandwidth limits and paywalls. It is a complete, ad-free bridge for anyone who needs total control over their media, from raw stream resolution to forensic-level song analysis.

[![SEO: 100/100](https://img.shields.io/badge/SEO-100%2F100-emerald?style=for-the-badge)](https://ej-nexstream.vercel.app)
[![Quality Gate](https://img.shields.io/sonar/quality_gate/ejjays_nexstream?server=https%3A%2F%2Fsonarcloud.io&style=for-the-badge)](https://sonarcloud.io/summary/new_code?id=ejjays_nexstream)
[![Performance: Optimized](https://img.shields.io/badge/Performance-Optimized-cyan?style=for-the-badge)](https://ej-nexstream.vercel.app)
[![Tech: React 19](https://img.shields.io/badge/Frontend-React_19-blue?style=for-the-badge)](https://react.dev)

---

## ⚡ Why NexStream?

Most media converters and music analysis tools have a common problem: **Server-Side Paywalls.**
Processing 4K video, running AI-based song separation (Stems) and Chord Recognition is expensive, so most "free" sites or apps throttle your speed, cap your quality at 1080p, or charge a monthly subscription.

**NexStream takes a different approach to keep professional tools free:**

1.  **No Quality Caps (Lossless 4K):** Instead of re-encoding your video on a slow server (which loses quality), NexStream uses a "Turbo Muxing" engine to assemble raw, high-fidelity streams into a single container on the server. This gives you native 4K/8K resolution for $0 with zero CPU overhead.
2.  **Pro-Grade Music Analysis:** High-fidelity song deconstruction and chord detection usually require a paid subscription. NexStream includes a **Remix Lab** that utilizes **SOTA (State-of-the-Art) MIR** (Music Information Retrieval) models—delivering studio-grade separation and chord accuracy without the paywall.
3.  **Anti-Throttle Tunneling:** To bypass the 30KB/s "bot-detection" limits that kill download speeds on other sites, NexStream uses a high-speed proxy tunnel. This delivers your media at 15MB/s+, ensuring you aren't waiting hours for a single song.
4.  **Universal Compatibility (.mp4):** Most browser tools output obscure formats that won't play on iPhones or standard players. NexStream standardizes every video download to the `.mp4` container, ensuring your 4K content plays natively everywhere with instant seeking support.

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

- **Turbo Muxing Engine**: Offloads media assembly to the server using zero-CPU `FFmpeg` stream copying. Merges high-bitrate video and audio into a unified MP4 container without quality loss.
- **Intelligence Seeder**: A background engine that can batch-resolve entire Spotify albums or artist catalogs, pre-populating the Global Edge Registry for sub-second user hits.
- **Unified MP4 Standard**: Automatically wraps all video downloads (including 4K VP9) into a standardized MP4 container with `faststart` metadata for instant seeking and maximum device compatibility.
- **JIT Playback Refresh**: Volatile CDN links expire. NexStream automatically refreshes these links upon retrieval from the registry by racing through provider endpoints, preventing 403 Forbidden errors.
- **Precision Metadata Fetching**: Deep integration with industry-standard music APIs to retrieve official cover art, high-accuracy ISRC, and acoustic features.
- **Zero-Disk Streaming Pipeline**: Built for stateless hosting environments. Pipes media data directly from source to client using memory-only buffers to eliminate disk I/O bottlenecks.
- **Technical Telemetry Terminal**: A terminal-class interface providing real-time logs from `yt-dlp` and `FFmpeg` via Server-Sent Events (SSE).

---

## 🎹 Remix Lab: SOTA Music Research

**NexStream extends beyond playback into professional, forensic-level analysis.**
The Remix Lab is a standalone research engine designed to hijack free cloud compute (Kaggle/Colab) for high-fidelity **Music Information Retrieval (MIR)** using **SOTA (State-of-the-Art)** models.

- **Dual-GPU Orchestration**: Manually allocates resources, assigning **HTDemucs** (Source Separation) to `GPU:0` and the **BTC Transformer** (Chord Recognition) to `GPU:1` to maximize throughput on free T4 instances.
- **Stem-Aware Theory**: Unlike standard chord identifiers, Remix Lab isolates the bass frequency using `nnAudio` and cross-references it with the harmony stems. If the generic model hears "C Major" but the bass stem is playing an "E", the Viterbi decoder forces a "C/E" (Slash Chord) resolution.
- **Kaggle-Native Compiler**: The entire multi-file Python module compiles itself into a single "Copy-Paste" block. No complex `pip install` or git cloning required for the end user—just paste and run.

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

### Research & Forensics (Remix Lab)

- **PyTorch**: Core tensor operations and GPU acceleration.
- **Demucs (HTDemucs)**: State-of-the-art source separation models.
- **Madmom**: Recurrent Neural Networks (RNN) for beat tracking.
- **Gradio**: Reactive UI for the research kernel.

### Backend Infrastructure

- **Node.js (Express 5)**: Scalable middleware and stream orchestration.
- **Termux**: Optimized for native Android hosting and development environments.
- **yt-dlp**: Low-level media manifest resolution.
- **FFmpeg 7.x/8.x**: Real-time server-side stream muxing (copy mode) and metadata injection.
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

    - **Backend (`backend/.env`):** Configure `TURSO_URL`, `TURSO_AUTH_TOKEN`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `COOKIES_URL`. Set `API_ONLY=true` if you only want to run the API.
    - **Frontend (`frontend/.env`):** Configure `VITE_API_URL` (e.g., `https://your-ngrok-url.ngrok-free.dev`) to point the frontend to your remote backend.

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

I built NexStream entirely on my phone because I don't have a computer yet. My goal is to keep high-quality tools like this free and ad-free for everyone. If this project helped you out, you can support my work here it will mean the world to me:

<p align="left">
  <a href="https://www.buymeacoffee.com/ejjays">
    <img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-orange?style=for-the-badge&logo=buy-me-a-coffee" />
  </a>
</p>
