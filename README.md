# NexStream: Media Orchestration Engine

**A high-performance media bridge built for the modern web. NexStream orchestrates low-level extraction engines, edge databases, and LLM-based query synthesis to provide high-fidelity media resolution without the overhead of traditional converters.**

[![SEO: 100/100](https://img.shields.io/badge/SEO-100%2F100-emerald?style=for-the-badge)](https://ej-nexstream.vercel.app)
[![Quality Gate](https://img.shields.io/sonar/quality_gate/ejjays_nexstream?server=https%3A%2F%2Fsonarcloud.io&style=for-the-badge)](https://sonarcloud.io/summary/new_code?id=ejjays_nexstream)
[![Performance: Optimized](https://img.shields.io/badge/Performance-Optimized-cyan?style=for-the-badge)](https://ej-nexstream.vercel.app)
[![Tech: React 19](https://img.shields.io/badge/Frontend-React_19-blue?style=for-the-badge)](https://react.dev)

---

## Technical Architecture: Asynchronous Resolution

NexStream implements a multi-layered concurrency model to ensure metadata integrity and sub-second UI responsiveness:

1.  **Asynchronous Hydration**: Triggers simultaneous calls to metadata providers. The first successful response hydrates the QualityPicker UI immediately, ensuring sub-1s modal visibility.
2.  **Level 0 (ISRC Mapping)**: Queries Deezer and iTunes APIs for authoritative International Standard Recording Codes.
3.  **Level 1 (Aggregator Verification)**: Consults Odesli (Songlink) for verified cross-platform manifest mapping.
4.  **Level 2 (Query Synthesis)**: Tiered fallback using Llama 3.3 (via Groq) and Gemini 2.0 Flash to reconstruct search queries based on duration and acoustic metadata.
5.  **Cache Integrity Policy**: To maintain registry quality, only ISRC-verified matches are persisted to the Global Registry. Non-verified matches are used for immediate requests but never cached.

---

## Core Capabilities

- **Global Edge Registry (Turso)**: A cloud-synced mapping database using libSQL. Resolved assets are indexed globally, enabling near-instant repeat resolution across the network.
- **JIT Playback Refresh**: Automatically refreshes volatile CDN preview links upon retrieval from the registry by racing through provider endpoints to prevent 403 authorization errors.
- **Precision Metadata Fetching**: Deep integration with industry-standard music APIs to retrieve official cover art, high-accuracy ISRC, and acoustic features.
- **Zero-Disk Streaming Pipeline**: Engineered for stateless hosting environments. Pipes media data directly from source to client using memory-only buffers to eliminate disk I/O bottlenecks.
- **Technical Telemetry Terminal**: A desktop-class terminal interface providing real-time logs from `yt-dlp` and `FFmpeg` via Server-Sent Events (SSE).
- **Mobile Asset Optimization**: Implements fragmented MP4 (fMP4) and Moov Atom relocation to ensure immediate playback compatibility with mobile system galleries.
- **High-Fidelity Previews**: Integrated audio preview system powered by authoritative provider manifests.

---

## Technical Stack

### Intelligence & Data

- **Turso (libSQL)**: Edge-hosted persistent registry.
- **Llama 3.3 & Gemini 2.0**: LLMs utilized for semantic query synthesis.
- **Odesli API**: High-speed manifest resolution and platform bridging.

### Frontend Architecture

- **React 19**: Concurrent rendering core for fluid UI responsiveness.
- **React Router 7**: Structured navigation and documentation namespace management.
- **Vite 7**: Optimized module bundling and hot module replacement.
- **Tailwind CSS 4**: Zero-runtime CSS orchestration.
- **Framer Motion**: Hardware-accelerated interface transitions.

### Backend Infrastructure

- **Node.js (Express 5)**: Scalable middleware and stream orchestration.
- **yt-dlp**: Low-level media manifest resolution.
- **FFmpeg 8.0**: Real-time stream muxing and metadata injection.
- **Server-Sent Events**: Real-time backend-to-frontend telemetry.

---

## Deployment & Provisioning

### Prerequisites

- **Node.js** (v22+)
- **yt-dlp & FFmpeg**: Available in system environment PATH.
- **Turso Database**: Provisioned database URL and Auth Token.
- **Environment Keys**: Google AI Studio, Groq, and API access keys.

### Quick Start

```bash
# Provision repository and dependencies
git clone https://github.com/ejjays/nexstream.git
cd nexstream && npm install
cd backend && npm install

# Initialize Environment
# Configure backend/.env with:
# TURSO_URL, TURSO_AUTH_TOKEN, GEMINI_API_KEY, GROQ_API_KEY, COOKIES_URL

# Start Development Environment
npm run dev
```

---

## System Topology

```bash
nexstream/
├── backend/                # Stream Orchestration & API Services
│   ├── src/
│   │   ├── app.js          # Entry point (Main Server Logic)
│   │   └── routes/         # Video & Media Route Definitions
├── frontend/               # React 19 SPA (Vite Architecture)
│   ├── src/
│   │   ├── assets/
│   │   │   ├── images/     # Standardized Image Assets
│   │   │   └── icons/      # Functional JSX Icon Components
│   │   ├── components/     # UI Component Library (Atomized)
│   │   └── pages/          # Technical Resource Center
├── mobile/                 # Experimental Mobile Core (Expo)
├── scripts/                # Utility & Deployment Scripts
└── public/                 # PWA & SEO Assets
```

---

_Focusing on high-performance media orchestration and open-web integrity._
