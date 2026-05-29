# Contributing

Hello thank you for reading this and if you're thinking about contributing I will really super appreciate it 😊
as a solo developer its been a challenge and working with amazing devs like you would be such a great honor.

if anything here is unclear, don't worry about getting it perfect — open an issue, say hi, and we'll figure it out together.

NexStream is a monorepo:

- `backend/` — Express + TypeScript (the media engine)
- `frontend/` — React 19 + Vite
- `shared/` — Zod schemas and types, shared by both
- `engine/` — Python music analysis, chords generation (Remix Lab)
- `mobile/` — Expo (experimental / i didnt yet focus in)

## Getting set up

prerequisites and install steps live in [`docs/run-an-instance.md`](docs/run-an-instance.md). the short version: Node 22+, `yt-dlp`, `ffmpeg`, and Redis — then `npm install` in `shared/`, `backend/`, and `frontend/`.

once that's done:

```bash
npm run api      # backend (dev)
npm run ui       # frontend (dev)
npm run check    # typecheck + lint — please run this before pushing
```

## Running the tests

the backend suite is heavy for phones — on termux, vitest gets OOM-killed; signal 9 by phantom killer— so there are two paths:

- **off Termux:** `cd backend && npm run test:single`
- **on Termux:** `npm run test:ci` pushes a throwaway branch, runs the full suite on CircleCI, and pulls the results back (needs `CIRCLECI_TOKEN`).

frontend tests: `cd frontend && npm test`. if you're fixing a bug or adding a feature, a test that covers it really helps — ideally one that fails first, then passes. mocking the external calls (YouTube/Spotify/Redis) keeps tests fast and offline.

## A few small conventions

nothing strict — these just keep things consistent, and a couple are enforced by lint:

- **types:** strict TypeScript, please — avoid `any`, and import shared types from `shared/schemas` instead of redefining them.
- **comments:** explain the *why* not *what* (except for notes), keep them short (~7 words), lowercase. there's a custom lint rule for this.
- **network and processes:** route outbound calls through the existing helpers — `no-raw-fetch` / `no-raw-spawn` will flag it otherwise.
- `npm run check` on the root dir before a PR catches most of the above.

## Commits and PRs

- lowercase, no hype, with a prefix: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `style:`, `ci:`.
- please open a PR rather than pushing to `main` — a short note on what changed and how you tested it is plenty.
- just don't commit secrets (`.env` and cookie files are already gitignored).

## Found a bug, or have an idea?

the issue templates make it quick — bugs, features, and "this site stopped working" each have a form. security issues are the one exception: please report those privately via [`SECURITY.md`](SECURITY.md) rather than a public issue.

thank you again — truly.
