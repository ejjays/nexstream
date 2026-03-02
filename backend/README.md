# NexStream Backend

The backend engine for NexStream, built with Node.js and Express, specialized in high-quality video/audio extraction using `yt-dlp`.

## 🏗️ Project Structure

The backend follows a modular **Suited-Service** architecture for high maintainability:

```text
backend/
├── src/
│   ├── app.js              # Server entry point & configuration
│   ├── controllers/        # Request handling & flow control
│   ├── routes/             # API endpoints (/info, /convert, /events)
│   ├── services/
│   │   ├── spotify/        # Multi-engine Spotify resolution suite
│   │   ├── ytdlp/          # Core extraction & streaming suite
│   │   └── seeder.service.js # Background intelligence gathering
│   └── utils/
│       ├── video.util.js   # Service detection & sanitization
│       ├── response.util.js # Data transformation & formatting
│       ├── sse.util.js     # Server-Sent Events management
│       └── cookie.util.js  # Remote cookie synchronization
├── temp/                   # Temporary file storage
└── Dockerfile              # Containerization config
```

## ⚙️ Environment Variables

Configure these in `backend/.env`:

- `GEMINI_API_KEY`: Required for AI-based metadata synthesis.
- `GROQ_API_KEY`: Optional fallback for Llama-based resolution.
- `TURSO_URL`: URL for the libSQL/Turso database.
- `TURSO_AUTH_TOKEN`: Auth token for Turso.
- `COOKIES_URL`: Remote URL to sync yt-dlp cookies.
- `API_ONLY`: Set to `true` to disable serving the frontend `dist` folder (useful for split deployments).

## 🚀 Key Features

- **Quantum Race Engine**: Parallel multi-source resolution (ISRC, AI, Odesli) for pinpoint accurate Spotify-to-YouTube mapping.
- **TV-Client 4K Strategy**: Bypasses YouTube's 360p (SABR) restrictions using optimized player clients.
- **Instant MP3 Transcoding**: Real-time server-side audio processing using `ffmpeg` pipes.
- **Hybrid Bridge Architecture**: Integrated support for React Native WebView hooks and native browser downloads.
- **Memory Efficient Streaming**: Uses direct anchor-tag downloads to handle large files (300MB+) without tab crashes.

## 🛠️ Requirements

- **Node.js**: 18+
- **yt-dlp**: Latest version recommended
- **FFmpeg**: Required for merging high-quality video and audio
- **Turso (LibSQL)**: Used for the "Super Brain" metadata caching layer

## 🔧 Technical Notes

- `extractor-args`: Configured with `player_client=tv,web,ios` to ensure DASH manifest availability for 4K URLs.
- `Concurrency Control`: Global process locking system to manage server resources in restricted environments like Termux.
- `SSE Progress`: Real-time feedback for metadata sync, initialization, and stream status.
