# @nexstream/extractors (prototype)

Proof-of-concept for pulling the JS extractors out of `web/backend` into a
standalone, dependency-free package. Not published — lives in the monorepo so
it can be exercised and decided on before anyone commits to npm.

## The pattern

Each extractor is a factory that takes an `ExtractorEnv` instead of importing
project internals (`secureFetch`, `getProxiedStream`, redis, express, etc.):

```ts
export interface ExtractorEnv {
  fetch: typeof fetch;
  streamUrl(url: string, headers: Record<string, string>): Promise<ReadableStream>;
}
```

Consumers can pass nothing (`createXExtractor()`) and get plain global
`fetch`, or inject their own SSRF-safe fetch / proxy pool / auth headers.

Ported so far: `x.ts`, `bluesky.ts`, `vimeo.ts` — 3 of 11, as a template for
the rest.

### The ffmpeg wrinkle (bluesky, vimeo HLS fallback)

Bluesky's streams are always HLS (`.m3u8`); Vimeo falls back to HLS when no
progressive mp4 exists. The original app remuxes these with a spawned
`ffmpeg` process — not something a pure-JS library should hardcode (it's a
native binary dependency, breaks in browsers/RN, and is a supply-chain
surface you don't want by default). Instead `getStream()` calls an optional
`env.remuxHls(url, headers)` hook and throws a clear, actionable error if
it's missing, rather than silently shelling out. Confirmed live: Bluesky's
`bsky.app` post below is 100% HLS and throws exactly that error without a
hook provided.

## Verifying it actually works for a consumer, not just for us

Two checks, run in order:

1. **`npm run demo:mock`** — builds `dist/` and runs `examples/mock-demo.ts`
   against it (not `src/`), using the *same fixture* as
   `web/backend/tests/extractors/x_extractor.test.ts`. Confirms the built
   package produces byte-identical output to the original in-repo extractor.

2. **Tarball install** — the real test, simulating a stranger's `npm install`:

   ```bash
   npm pack
   mkdir /tmp/consumer-test && cd /tmp/consumer-test
   npm init -y && npm install /path/to/nexstream-extractors-0.0.1.tgz
   # write a throwaway script that imports '@nexstream/extractors' and run it
   ```

   This is the check that matters — it catches "works in the repo, missing
   from the published files" bugs, which `demo:mock` alone would miss since
   it still runs from inside this folder.

Both were run during prototyping: `demo:mock` passed all assertions, and the
tarball install worked correctly from a separate project's `node_modules`.

### Live verification (real network, real URLs)

`examples/live-real.mjs` runs the built package against the exact fixture
URLs from `mobile/tests/live/live-cases.json` — the same URLs the app's own
live test suite trusts. All three passed against real hosts:

```
PASS  x (mrbeast tweet) (1379ms) — 4 formats, real MrBeast tweet
PASS  bluesky (bsky.app official post) (1487ms) — 2 formats
PASS  vimeo (official video) (436ms) — 4 formats
```

Also confirmed with real bytes, not just metadata:
- `vimeo.getStream()` on a real progressive mp4 format pulled actual bytes
  from Vimeo's CDN.
- `bluesky.getStream()` correctly throws the "needs env.remuxHls" error,
  since every Bluesky format really is HLS.
- Re-ran the tarball install (`npm pack` → fresh scratch project →
  `npm install ./the.tgz`) with all 3 extractors, then made a real Vimeo
  call from the installed package — worked identically to running in-repo.

## What's still unresolved before this could be a real package

- 3 of 11 web extractors ported (`x.ts`, `bluesky.ts`, `vimeo.ts`). Same
  mechanical conversion needed for the rest — see the parent conversation
  for the per-file import audit. Vimeo (multi-step config/page-hash/
  player-page fallback chain) was the most involved of the three; the
  remaining 8 range between X's simplicity and Vimeo's.
- `env.remuxHls` is unimplemented in `defaultEnv` — any consumer wanting
  Bluesky or HLS-fallback Vimeo streams must supply it themselves (e.g.
  spawn `ffmpeg`, or use a WASM remuxer for browser/RN use).
- No `getStream` proxy hardening (SSRF checks) in `defaultEnv` — that's
  intentional (keeps the lib dependency-free) but means consumers running
  this server-side should inject their own `streamUrl`.
- License: package.json says MIT; repo root is AGPL-3.0. Dual-licensing is
  fine (you own the code) but decide deliberately, not by default.
