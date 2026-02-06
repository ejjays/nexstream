# 🚀 NexStream

**Tired of converters filled with ads and paywalls for high-resolution video? NexStream is a free, open-source alternative built for speed, quality, and a premium experience powered by cutting-edge AI and Direct-Stream technology.**

---

## 💡 Why NexStream?

Most online converters are cluttered with intrusive ads and restrict high-quality downloads (4K or higher) behind paywalls. NexStream provides a clean, ad-free solution that leverages `yt-dlp` and **Gemini 2.0 Flash** to deliver the best quality available—including 4K/60fps and professional-grade audio—for free.

**New in 2026:** Optimized specifically for free-tier hosting (like Render). Our new **Elite Streaming Pipeline** allows you to download 1-hour+ videos (900MB+) without hitting "100-second timeouts" or disk space limits.

---

## 📸 Preview

<div align="center">
  <img src="public/og-image.png" alt="NexStream UI" width="70%" />
</div>

---

## ✨ Features

- 💥 **Modern UI**: Minimalist, sleek, and fully responsive design built with Tailwind CSS 4.
- ⚡ **Elite Streaming Pipeline**: Bypasses cloud hosting limitations (Render/Heroku/Vercel) by piping data directly from source to user. **No server-side disk usage, no timeouts, just instant downloads.**
- 📱 **Mobile Gallery Ready**: Uses fragmented MP4 (fMP4) muxing to ensure large video streams are immediately recognized and playable in Android/iOS galleries.
- ⚡ **Direct Stream Copy (Lossless)**: Unlike other tools that "re-encode" and lose sound quality, NexStream grabs the original AAC/M4A data directly from Google’s servers. 100% identical to the source.
- ⏭️ **Odesli (Songlink) Engine**: Instant Spotify-to-YouTube resolution using Odesli’s specialized cross-platform matching. No more manual searching!
- ⚡ **Real-time Progress**: Track download and conversion status via Server-Sent Events (SSE).
- 🎥 **4K/UHD Support**: Download videos in 4K, 8K, and high-frame-rate (60fps) formats.
- 🧠 **AI-Powered Fallback**: Uses **Gemini 2.0 Flash** as a "Query Architect" to intelligently resolve obscure tracks when API matching fails.
- 🎵 **Pro Spotify Converter**: High-fidelity conversion using `spotify-url-info` and **ISRC (Fingerprint)** matching for official studio versions.
- 🖼️ **Professional Metadata**: Automatically embeds Artist, Album, Release Year, and **Original Spotify Cover Art** directly into your music files.
- 🚀 **Engineered for Speed**: Optimized with **Deno** as a JavaScript challenge solver, making signature extraction significantly faster than standard Node.js implementations.
- 🛠️ **Format Picker**: Choose your preferred quality and format (MP4/M4A/MP3) before downloading.

---

## 🛠️ Tech Stack

### AI & Brain
- **Google Gemini 3 Flash**: The AI brain for intelligent song matching and metadata analysis.
- **Odesli (Songlink)**: The industry standard for high-speed music link resolution.

### Frontend
- **React 19**: Modern component-based UI.
- **Vite**: Lightning-fast build tool.
- **Tailwind CSS 4**: Next-gen utility-first styling.
- **Framer Motion**: Fluid UI animations and transitions.

### Backend
- **Node.js & Express**: Scalable server-side logic.
- **Deno**: High-performance JavaScript runtime used for `yt-dlp` challenge solving.
- **yt-dlp**: The industry standard for video/audio extraction.
- **FFmpeg**: Essential for stream copying and injecting professional metadata tags.
- **SSE (Server-Sent Events)**: Live status updates pushed to the frontend.

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v18 or higher)
- **Deno**: Required for high-speed signature solving.
- **yt-dlp**: Must be in your system's PATH.
- **FFmpeg**: Required for 4K video merging and metadata injection.

### 1. Clone the Repository
```bash
git clone https://github.com/ejjays/nexstream.git
cd nexstream
```

### 2. Configure Environment Variables
Create a `.env` file in the **root** directory:
```env
VITE_API_URL="http://localhost:5000"
```

Create a `.env` file in the **backend** directory:
```env
GEMINI_API_KEY="your_google_ai_studio_key"
```

### 3. Setup the Backend
```bash
cd backend
npm install
npm start
```

### 4. Setup the Frontend
```bash
# Open a new terminal in the root directory
npm install
npm run dev
```

--- 

## 📂 Project Structure

```bash
nexstream/
├── backend/                # Express server logic
│   ├── index.js            # Entry point
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Core logic (AI, yt-dlp, Spotify)
│   │   └── utils/          # Helpers (SSE, Cookies)
│   └── package.json        
├── src/                    # React frontend
│   ├── components/         
│   │   ├── ui/             # Reusable UI elements
│   │   ├── modals/         # Quality selection modals
│   │   └── MainContent.jsx # Main app logic
├── public/                 # Static assets
└── tailwind.config.js      # Styling configuration
```

---

## 🤝 Contributing

1. Fork the Project.
2. Create your Feature Branch.
3. Commit your Changes.
4. Push to the Branch.
5. Open a Pull Request.

---

*Built for speed, accuracy, and quality. Powered by Gemini 3.*