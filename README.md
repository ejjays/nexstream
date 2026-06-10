<p align="center">
  <img src="frontend/public/logo.webp" alt="NexStream" width="180" />
</p>

<h1 align="center">NexStream — Media Orchestration Engine</h1>

<p align="center">
  <strong>Built for musicians, creators, and power users who need professional-grade tools without the premium price tag.</strong>
</p>

<p align="center">
  <a href="https://nex-stream.pages.dev"><strong>🌐 Visit NexStream →</strong></a>
</p>

Whether downloading high-fidelity 4K+ video and audio or deconstructing a song into individual stems and chords for practice, NexStream delivers the power of expensive subscription-based apps entirely for free. By moving heavy media processing away from slow servers and directly onto your device—and utilizing AI for deep music analysis—it bypasses traditional bandwidth limits and paywalls. It is a complete, ad-free bridge for anyone who needs total control over their media, from raw stream resolution to forensic-level song analysis.

<p align="center">
  <a href="https://react.dev"><img src="https://img.shields.io/badge/Frontend-REACT%2019-blue?style=flat" alt="Frontend" /></a>
  <a href="https://pagespeed.web.dev/analysis/https-nex-stream-pages-dev/1gip28m9kv?form_factor=desktop"><img src="https://img.shields.io/badge/SEO-100%2F100-emerald?style=flat" alt="SEO" /></a>
  <a href="https://pagespeed.web.dev/analysis/https-nex-stream-pages-dev/1gip28m9kv?form_factor=desktop"><img src="https://img.shields.io/badge/Performance-99%2F100-cyan?style=flat" alt="Performance" /></a>
  <a href="https://app.deepsource.com/gh/ejjays/nexstream/"><img src="https://app.deepsource.com/gh/ejjays/nexstream.svg/?label=resolved+issues&token=AjSUM1LGBlY2Uzo6_spxrx9Q" alt="DeepSource" /></a>
</p>

---

## ⚡ Why NexStream?

NexStream is a free, self-hostable media-orchestration engine with a music-research lab built in. A few of the things it does:

1.  **A built-in music lab.** The **Remix Lab** breaks a track into **stems** (vocals, bass, drums, other) and detects its **chords and key** using state-of-the-art (SOTA) AI models — the kind of studio-grade analysis that's usually behind a subscription.

2.  **Cross-platform link resolution.** Paste a link — Spotify included — and a parallel race of **ISRC-verified** sources (Deezer, iTunes, Soundcharts) helps find the right studio recording rather than a chance "live" or "cover." Verified matches are cached in a global edge registry, so repeats are near-instant.

3.  **Native platform support.** YouTube, Facebook, Instagram, TikTok, and SoundCloud each have a dedicated pure-JS extractor running inside the Node server, so those platforms don't need to spawn a `yt-dlp` Python subprocess per request. `yt-dlp` is kept as a fallback for sources without a native extractor.

4.  **4K without a server bill.** A hybrid muxing pipeline stitches high-bitrate video and audio together with zero re-encode, and can offload the heavy work to the browser — a Web Worker remuxes straight to disk via OPFS (using `mediabunny`) — so even a free Termux/Android box can serve true 4K.

5.  **Built to feel fast.** The UI fills in from the first metadata it finds, downloads begin streaming before the file is finished, and already-seen tracks come straight from cache.

Under the hood it's a real system — a parallel resolution race, a zero-disk streaming pipeline, an edge-muxing engine, and an MIR research kernel.

---

## 🧠 Resolving the Right Recording: The "Parallel Race"

Resolving a song to the _right_ recording is the hard part, so NexStream races several sources in parallel and prefers verified matches over a best-guess search.

### 1. Staggered resolution + early hydration

As soon as any source returns the basics (title, artist, cover), it pushes them to the UI over Server-Sent Events (SSE) so the page fills in while resolution continues. Candidates run concurrently, ranked by trust:

- **ISRC (authoritative):** taken straight from the **Spotify Web API** when available, with **Soundcharts**, **Deezer**, and **iTunes** as fallbacks — then the track is matched by that code.
- **Aggregation:** **Odesli (Songlink)** mappings plus a **SoundCloud** search.
- **AI fallback:** if nothing strict matches, **Llama 3.3** (Groq) — falling back to **Gemini** — drafts a search query from the metadata and duration.

A verified ISRC match settles the race immediately; otherwise candidates are weighed by duration drift — a tight 25s window for low-priority candidates — so you tend to get the studio recording rather than a "live" or "cover."

### 2. Global Edge Registry (Turso)

The registry caches the _resolution_ — the "Spotify track → YouTube video" mapping with its ISRC and metadata — not the media itself, in a distributed **Turso (libSQL)** database. Only ISRC-verified matches are persisted, so bad metadata stays out, and a background worker refreshes preview links before they expire.

---

## 🛠️ Core Capabilities

- **Turbo Muxing Engine**: Offloads media assembly to the server using zero-CPU `FFmpeg` stream copying. Merges high-bitrate video and audio into a unified MP4 container without quality loss.

- **Intelligence Seeder**: A background engine that can batch-resolve entire Spotify albums or artist catalogs, pre-populating the Global Edge Registry for sub-second user hits.

- **Unified MP4 Standard**: Automatically wraps all video downloads (including 4K VP9) into a standardized MP4 container with `faststart` enabled, so playback can begin before the download finishes.

- **JIT Playback Refresh**: Volatile CDN links expire. NexStream automatically refreshes these links upon retrieval from the registry by racing through provider endpoints, preventing 403 Forbidden errors.

- **Precision Metadata Fetching**: Deep integration with industry-standard music APIs to retrieve official cover art, high-accuracy ISRC, and acoustic features.

- **Zero-Disk Streaming Pipeline**: Built for stateless hosting environments. Pipes media data directly from source to client using memory-only buffers to eliminate disk I/O bottlenecks.

- **Technical Telemetry Terminal**: A terminal-class interface providing real-time logs from `yt-dlp` and `FFmpeg` via Server-Sent Events (SSE).

---

## 🎹 Remix Lab: SOTA Music Research

The Remix Lab is a standalone research engine that extends NexStream beyond playback into forensic-level analysis. It's built to run on free Kaggle/Colab GPU instances for high-fidelity **Music Information Retrieval (MIR)** using **State-of-the-art** models.

- **Dual-GPU Orchestration**: Manually allocates resources, assigning the chosen separation engine (**Demucs** or **BS-RoFormer**) to `GPU:0` and the **BTC Transformer** (Chord Recognition) to `GPU:1` to maximize throughput on free T4 instances.

- **Stem-Aware Theory**: Unlike standard chord identifiers, Remix Lab isolates the bass frequency using `nnAudio` and cross-references it with the harmony stems. If the generic model hears "C Major" but the bass stem is playing an "E", the Viterbi decoder forces a "C/E" (Slash Chord) resolution.

- **Kaggle-Native Compiler**: The entire multi-file Python module compiles itself into a single "Copy-Paste" block. No complex `pip install` or git cloning required for the end user—just paste and run.

📖 **Deep dive: [`docs/remix-lab.md`](docs/remix-lab.md)** — models, dual-GPU design, the API, and how to run it.

---

## 💻 Technical Stack

### Intelligence & Data

- **Turso (libSQL)**: Edge-hosted persistent registry.
- **Spotify Web API**: Track metadata, ISRC, and audio features for the source link.
- **Authoritative Data Nodes**: **Soundcharts**, **Deezer**, and **iTunes** for ISRC cross-verification when Spotify's is unavailable.
- **Odesli API**: High-speed manifest resolution and platform bridging.
- **Llama 3.3 & Gemini**: LLMs utilized for semantic query synthesis.

### Frontend Architecture

- **React 19**: Concurrent rendering core for fluid UI responsiveness.
- **Web Workers + OPFS**: On-device muxing runs off the main thread and streams directly to disk via the Origin Private File System, so 4K downloads assemble in-browser without freezing the UI or buffering in memory.
- **Vite 7**: Optimized module bundling and hot module replacement.
- **Tailwind CSS 3**: Utility-first styling with JIT compilation.

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
curl -sL https://raw.githubusercontent.com/ejjays/nexstream/main/scripts/setup/termux-install.sh | bash
```

### Standard Deployment

```bash
git clone https://github.com/ejjays/nexstream.git
cd nexstream

npm install

# install workspace deps(cd shared && npm install) && (cd backend && npm install) && (cd frontend && npm install)

# dev (two shells)
npm run api   # backend on :5000
npm run ui    # frontend
```

You'll need Node 22+, `yt-dlp`, `ffmpeg`, and Redis. Full setup, environment variables, Docker, and tunnel notes are in **[`docs/run-an-instance.md`](docs/run-an-instance.md)** and **[`docs/env-variables.md`](docs/env-variables.md)**.

---

## 📚 Documentation

- [Run an instance](docs/run-an-instance.md) — self-host on Termux, Docker, or a server
- [Environment variables](docs/env-variables.md) — every config option
- [Protect an instance](docs/protect-an-instance.md) — hardening a public deployment
- [API reference](docs/api.md) — endpoints and response shapes
- [Remix Lab](docs/remix-lab.md) — the SOTA music-analysis engine (stems, chords, key)
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md)

---

## 📱 Mobile Architecture (Expo)

The `/mobile` directory contains an experimental React Native implementation designed to bypass mobile browser limitations.

- **WebView Bridge**: Intercepts download triggers from the frontend.
- **Storage Access Framework (SAF)**: Uses native Android APIs to save files directly to the user's file system, bypassing the "blob" storage limits of mobile Chrome.

---

## 🗺️ System Topology

```bash
nexstream/
├── backend/                    # Express 5 API + stream orchestration
│   └── src/
│       ├── app.ts              # Entry point (server + SSE wiring)
│       ├── controllers/        # video / keychanger request handlers
│       ├── routes/             # video, remix, keychanger route defs
│       ├── services/           # Spotify, yt-dlp, extractors, seeder, social
│       ├── utils/              # network, media, infra, api helpers
│       └── types/              # shared TS types
├── frontend/                   # React 19 SPA (Vite 7, Tailwind 3)
│   ├── public/                 # PWA assets, icons, static files
│   ├── functions/              # Cloudflare Pages edge functions
│   └── src/
│       ├── App.tsx · main.tsx  # SPA shell + entry
│       ├── lib/                # muxer, OPFS, SSE, orchestrator (heavy lifting)
│       ├── components/         # UI atoms + remix/terminal/modals/docs/ui
│       ├── pages/              # Tools, Guide, About, NotFound
│       ├── hooks/              # SSE, remix engine, downloads, tuner, metronome
│       ├── store/ · context/   # Zustand store + Remix context
│       └── types/              # frontend TS types
├── engine/                     # Remix Lab MIR kernel (Python, Kaggle/Colab)
│   ├── app.py · orchestrator.py
│   ├── audio_engines.py · model_manager.py
│   ├── processing.py · theory_utils.py
│   └── setup_env.py · config.py
├── mobile/                     # Experimental React Native (Expo)
│   ├── webview/                # WebView bridge + SAF native saves
│   └── analyzer/               # On-device analyzer prototype
├── shared/                     # Cross-workspace Zod schemas
├── scripts/                    # Setup, tunnels (cloudflare/ngrok/zrok), Kaggle bundler
├── docs/                       # Self-host, env, hardening, API reference
└── .github/ · .circleci/       # CI, issue/PR templates
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

---

## License

NexStream is free software, licensed under the [GNU AGPL-3.0-or-later](LICENSE). You're free to use, self-host, study, and modify it — and if you run a _modified_ version as a public network service, AGPL §13 asks that you offer that version's source to its users. See [`docs/protect-an-instance.md`](docs/protect-an-instance.md) for hosting notes.
