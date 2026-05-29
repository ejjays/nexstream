# Environment variables

NexStream boots without most of these — they enable optional features and degrade gracefully when unset. backend vars go in `backend/.env`, frontend vars in `frontend/.env`.

## Where to get keys

most of the API-keyed vars require an account with the provider:

- **Spotify** — [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → create an app, copy client id and secret.
- **Gemini** — [aistudio.google.com/api-keys](https://aistudio.google.com/api-keys). free tier is generous.
- **Groq** — [console.groq.com/keys](https://console.groq.com/keys). free tier is generous.
- **Redis** — local install (`pkg install redis` on Termux or a free hosted instance from [Aiven](https://aiven.io).
- **Turso** — [app.turso.tech](https://app.turso.tech) → create a database, then copy its URL and an auth token from the dashboard. CLI alternative: `turso db tokens create <db>` via the [Turso CLI](https://docs.turso.tech/cli/installation).
- **Soundcharts** — [soundcharts.com/api](https://soundcharts.com/api). commercial — sandbox keys on request.
- **Kaggle** — [kaggle.com/settings](https://www.kaggle.com/settings) → "Create New API Token" (downloads `kaggle.json` with username + key).
- **Sentry** — project settings → Client Keys (DSN).

## Backend (`backend/.env`)

### Core
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | port the server listens on. |
| `API_ONLY` | `false` | set `true` to serve only the API (skip the bundled frontend). |
| `LOG_LEVEL` | `info` | log level. |
| `NODE_ENV` | — | `production` tightens logging; `test` is set by the test runner. |

### Data and cache
| Variable | Default | Purpose |
|---|---|---|
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis for the metadata cache and job queue. |
| `TURSO_URL` | — | libSQL/Turso URL for the persistent edge registry. falls back to an in-memory mock if unset (and on Termux, where the native lib is unavailable). |
| `TURSO_AUTH_TOKEN` | — | auth token for Turso. |

### Extraction
| Variable | Default | Purpose |
|---|---|---|
| `COOKIES_URL` | — | URL to fetch a Netscape `cookies.txt` on startup — improves YouTube reliability. |
| `YTDLP_COOKIES_FILE` | — | path to a local cookies file (overrides the default location). |
| `ENABLE_POT_PLUGIN` | `0` | set `1` to auto-spawn the bgutil PO-token server. off by default (bgutil's BotGuard step is currently flaky). |

### Metadata and AI (music resolution)
| Variable | Default | Purpose |
|---|---|---|
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | — | Spotify Web API credentials for track metadata. |
| `SOUNDCHARTS_APP_ID`, `SOUNDCHARTS_API_KEY` | — | Soundcharts (ISRC-verified metadata). |
| `GEMINI_API_KEY` (or `VERTEX_API_KEY`) | — | Gemini, used to synthesize a search query when strict matches fail. |
| `GROQ_API_KEY` | — | Groq/Llama, same fallback role. |

### Security (set these for a public instance)
| Variable | Default | Purpose |
|---|---|---|
| `API_KEY` | — | if set, required on `/info`, `/stream-urls`, `/convert`, `/proxy`, `/api/*`. `127.0.0.1` is exempt. |
| `PROXY_SIGNING_SECRET` | random per boot | HMAC secret for signed proxy/stream URLs. pin a fixed value so links stay valid across restarts. |
| `PROXY_URL_TTL_SECONDS` | `21600` (6h) | lifetime of a signed proxy/stream URL. |

### Remix Lab and monitoring
| Variable | Default | Purpose |
|---|---|---|
| `KAGGLE_USERNAME`, `KAGGLE_KEY` | — | Kaggle credentials for the Remix Lab engine sync. |
| `SENTRY_DSN` | — | Sentry error/performance monitoring. |

## Frontend (`frontend/.env`)
| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | — | backend base URL (e.g. your tunnel URL). required for the frontend to reach a remote API. |
| `VITE_SENTRY_DSN` | — | Sentry DSN for the frontend. |
