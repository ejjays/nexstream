# 🚀 NexStream

**Tired of converters filled with ads and paywalls for high-resolution video? NexStream is a free, open-source alternative built for speed, quality, and a premium experience powered by cutting-edge AI.**

---

## 💡 Why NexStream?

Most online converters are cluttered with intrusive ads and restrict high-quality downloads (4K or higher) behind paywalls. NexStream provides a clean, ad-free solution that leverages `yt-dlp` and **Gemini 3 Flash** to deliver the best quality available—including 4K/60fps and professional-grade audio—for free.

---

## 📸 Preview

<div align="center">
  <img src="public/og-image.png" alt="NexStream UI" width="70%" />
</div>

---

## ✨ Features

- 💥 **Modern UI**: Minimalist, sleek, and fully responsive design built with Tailwind CSS 4.
- ⚡ **Real-time Progress**: Track download and conversion status via Server-Sent Events (SSE).
- 🎥 **4K/UHD Support**: Download videos in 4K, 8K, and high-frame-rate (60fps) formats.
- 🧠 **AI-Powered Matching**: Uses **Gemini 3 Flash** to intelligently refine search queries for 100% accurate Spotify-to-YouTube matching.
- 🎵 **Pro Spotify Converter**: High-fidelity conversion using `spotify-url-info` and **ISRC (Fingerprint)** matching for official studio versions.
- 🖼️ **Professional Metadata**: Automatically embeds Artist, Album, Release Year, and **Original Spotify Cover Art** directly into your files using FFmpeg.
- 🚀 **Optimized Playback**: Automatic VP9/MP4 optimization for smooth playback across all devices.
- 🛠️ **Format Picker**: Choose your preferred quality and format (MP4/MP3) before downloading.

---

## 🛠️ Tech Stack

### AI & Brain
- **Google Gemini 3 Flash**: The "Query Architect" for intelligent song matching and metadata analysis.
- **spotify-url-info**: Professional-grade metadata extraction.

### Frontend
- **React 19**: Modern component-based UI.
- **Vite**: Lightning-fast build tool.
- **Tailwind CSS 4**: Next-gen utility-first styling.
- **Framer Motion**: Fluid UI animations and transitions.

### Backend
- **Node.js & Express**: Scalable server-side logic.
- **yt-dlp**: The industry standard for video/audio extraction.
- **FFmpeg**: Essential for merging streams and injecting professional metadata tags.
- **SSE (Server-Sent Events)**: Live status updates pushed to the frontend.

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v18 or higher)
- **yt-dlp**: Must be in your system's PATH.
- **FFmpeg**: Required for 4K video merging and metadata injection.
- **Python**: Required by `yt-dlp`.

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
