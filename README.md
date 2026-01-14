# 🚀 NexStream

**Tired of converters filled with ads and paywalls for high-resolution video? NexStream is a free, open-source alternative built for speed, quality, and a premium experience without any cost.**

---

## 💡 Why NexStream?

Most online converters are cluttered with intrusive ads and restrict high-quality downloads (4K or higher) behind paywalls. NexStream provides a clean, ad-free solution that leverages `yt-dlp` to deliver the best quality available—including 4K/60fps—for free.

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
- 🎵 **Spotify Support**: Intelligent metadata scraping and YouTube matching for Spotify links.
- 🚀 **Optimized Playback**: Automatic VP9/MP4 optimization for smooth playback across all devices.
- 🛠️ **Format Picker**: Choose your preferred quality and format (MP4/MP3) before downloading.

---

## 🛠️ Tech Stack

### Frontend
- **React 19**: Modern component-based UI.
- **Vite**: Lightning-fast build tool.
- **Tailwind CSS 4**: Next-gen utility-first styling.
- **Framer Motion**: Fluid UI animations and transitions.
- **Lucide React**: Clean, consistent iconography.

### Backend
- **Node.js & Express**: Scalable server-side logic.
- **yt-dlp**: The industry standard for video/audio extraction.
- **FFmpeg**: Essential for merging high-quality video and audio streams.
- **SSE (Server-Sent Events)**: Live status updates pushed to the frontend.

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v18 or higher)
- **yt-dlp**: Must be in your system's PATH. ([Installation Guide](https://github.com/yt-dlp/yt-dlp#installation))
- **FFmpeg**: Required for 4K video merging and MP3 conversion. ([Installation Guide](https://ffmpeg.org/download.html))
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
*(Optional)* For the backend, you can set a `COOKIE_URL` in your environment to help `yt-dlp` bypass bot detection.

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
│   │   ├── services/       # Core logic (yt-dlp, Spotify)
│   │   └── utils/          # Helpers (SSE, Cookies)
│   ├── temp/               # Temporary storage & yt-dlp cache
│   └── package.json        
├── src/                    # React frontend
│   ├── components/         
│   │   ├── ui/             # Reusable UI elements
│   │   ├── modals/         # Quality selection modals
│   │   └── MainContent.jsx # Main app logic & SSE handling
│   ├── App.jsx             
│   └── main.jsx            
├── public/                 # Static assets
└── tailwind.config.js      # Styling configuration
```

---

## 🤝 Contributing

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📝 Learning Journey
This project explores the intersection of real-time web communication (SSE), system-level process management in Node.js, and modern React 19 patterns.

---

*Made with ❤️ and a lot of caffeine.*