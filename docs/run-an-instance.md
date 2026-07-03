# Running an instance

NexStream runs on Node.js 22+. it shells out to `yt-dlp` and `ffmpeg`, uses Redis for caching/queueing, and optionally Turso (libSQL) for the persistent registry. it's built to self-host cheaply — including directly on android via termux.

## Prerequisites

- Node.js ≥ 22
- `yt-dlp` and `ffmpeg` on `PATH`
- Redis (local is fine — defaults to `redis://127.0.0.1:6379`)
- optional: a Turso database for the persistent edge registry

## Quick start — Termux (Android)

automated provisioning (system update + dependencies + build):

```bash
curl -sL https://raw.githubusercontent.com/ejjays/nexstream/main/scripts/setup/termux-install.sh | bash
```

## Manual setup

```bash
git clone https://github.com/ejjays/nexstream.git
cd nexstream

# install workspace deps
(cd shared && npm install)
(cd backend && npm install)
(cd frontend && npm install)
```

then create your env files — see [`env-variables.md`](env-variables.md) for the full reference and [where to get the API keys](env-variables.md#where-to-get-keys). at minimum set `VITE_API_URL` (frontend) to wherever the backend is reachable.

**development** (two shells):

```bash
npm run api   # backend on :5000 (tsc watch + server)
npm run ui    # frontend (Vite dev server)
```

**production-style:**

```bash
npm run build:api      # installs + tsc build
npm run build:ui       # installs + vite build
cd backend && npm start
```

## Docker (backend)

the build context is the repo root; the image bundles `yt-dlp` + `ffmpeg` and listens on `8000`:

```bash
docker build -f web/backend/Dockerfile -t nexstream .
docker run -p 8000:8000 --env-file web/backend/.env nexstream
```

## Exposing it

self-hosting from a phone or home box usually means a tunnel. the repo ships helpers in [`scripts/tunnels/`](../scripts/tunnels/) for Cloudflare, ngrok, and zrok. start one, then point the frontend's `VITE_API_URL` at the tunnel URL.

before putting an instance on the public internet, read [`protect-an-instance.md`](protect-an-instance.md).
