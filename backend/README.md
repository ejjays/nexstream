# NexStream Backend

The backend engine for NexStream, built with Node.js and Express, specialized in high-quality video/audio extraction using `yt-dlp`.

## 🏗️ Project Structure

The backend follows a modular **Service-Route-Utility** architecture for better maintainability:

```text
backend/
├── index.js                # Server entry point & configuration
├── src/
│   ├── routes/
│   │   └── video.routes.js # API endpoints (/info, /convert, /events)
│   ├── services/
│   │   ├── ytdlp.service.js   # Core yt-dlp logic & 4K optimizations
│   │   └── spotify.service.js # Spotify-to-YouTube resolution logic
│   └── utils/
│       ├── sse.util.js     # Server-Sent Events management
│       └── cookie.util.js  # Remote cookie synchronization
├── temp/                   # Temporary file storage
│   └── yt-dlp-cache/       # Persistent cache for faster extraction
└── Dockerfile              # Containerization config
```

## 🚀 Key Features

- **4K/8K Support**: Optimized using a "TV-Client" strategy to bypass YouTube's 360p (SABR) restrictions.
- **Smart Progress Tracking**: Real-time download and merging status via SSE (Server-Sent Events).
- **Spotify Stealth Resolution**: Automatically resolves Spotify links to their highest quality YouTube counterparts.
- **Auto-Cleanup**: Periodic task to remove temporary files and keep the storage clean.
- **JS Solving**: Integrated with `Deno` to handle complex YouTube player signatures efficiently.

## 🛠️ Requirements

- **Node.js**: 18+
- **yt-dlp**: Latest version recommended
- **FFmpeg**: Required for merging high-quality video and audio
- **Deno**: Recommended for faster JS challenge solving

## 🔧 Technical Notes

The project uses specialized `extractor-args` for `yt-dlp` to ensure maximum compatibility:
- `player_client=tv,web,ios`: Prioritizes clients that provide DASH manifests with 4K URLs.
- `--force-ipv4`: Ensures stable connectivity in restricted environments like Termux.
- `--ignore-config`: Prevents local system configs from interfering with the optimized server logic.
