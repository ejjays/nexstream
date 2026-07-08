# NexStream — Android

native Android app, built with Expo (React Native 0.85, Hermes, new architecture). it does the whole download flow on the phone — resolve, download, mux, save — and talks to no backend at all. theres also a small **Updates tab** (Supabase-backed) for app news, reactions, and comments.

## Why built this

honestly, this started because the web version kept hitting walls on free hosting. the backend runs on free tier Koyeb box (cant afford purchasing one yet), and two things kept breaking it: YouTube bot blocks datacenter IPs, so extraction from Koyeb gets walled (PO-token trick helps, but cant fake home IP — datacenter still gets flagged); and free tier has so little memory that `yt-dlp` & `ffmpeg` OOMs it constantly, not good for production.

my workaround was a hybrid setup — my phone on home wifi acts like a residential worker the backend calls out to for `yt-dlp` and media relay (see [`phone-worker-setup.md`](../../docs/phone-worker-setup.md)). it works, but two things killed it. it's **slow**: Koyeb's free tier only runs in Frankfurt, and im in the PH, so every request takes a long round trip — user → EU server → my phone in PH → back to the EU server → back to user. the media bytes cross half the planet twice before anyone sees them. and its **fragile**: I wouldn't trust it in production — the worker phone can drop wifi, turned off, or just get killed by phantom killer, and I don't have dedicated spare device to keep it alive 24/7. tried free residential proxies — they'd fix the IP problem, but they're expensive and very limited.

so instead, I moved the whole thing into the phone by creating this mobile app. each users device is its own residential IP and does its own extraction, download, and mux — right where the user is, so no transcontinental round trip, nothing to OOM, no proxy bill, and no single worker phone or slow free tier server to babysit.

## How it works

every source resolves to a common `VideoInfo` shape (`src/extractors/types.ts`), then the picker hands the chosen format to the download pipeline. the app is three tabs (home / settings / updates) wired up in `App.tsx`; downloads run through the `useDownload` hook into `src/lib/download/downloadPipeline.ts`.

**resolution** — `resolve()` in `src/extractors/index.ts` routes a URL by hostname to a platform extractor. before the network even gets touched it checks an in-memory cache (`src/lib/cache.ts`; skip with `EXPO_PUBLIC_DISABLE_FAST_RESOLVE=1`). YouTube, Spotify, and SoundCloud stream a **partial** `VideoInfo` back over an `onPartial` callback, so the UI hydrates from the first metadata it finds while the rest is still resolving. a known Spotify→YouTube mapping can also come straight from the shared read-only edge registry (`src/lib/social/registry.ts`, Turso) and skip the work entirely.

**pure-JS extractors** — most platforms fetch the page/API directly and parse the stream URLs out of the embedded JSON (with a regex fallback), no `yt-dlp` anywhere. the full list of supported platforms is just the contents of [`src/extractors/`](src/extractors/) — that folder *is* the source of truth. extractor fetches go through `gatedFetch` (`src/lib/net.ts`), which does per-host concurrency limiting + 429 backoff so the app doesn't get itself bot-blocked. each extractor throws a typed `ExtractorError` (`src/extractors/errors.ts`) on failure, carrying a `retryable` flag the UI uses for its retry button.

**YouTube** is the hard one, so it runs inside a hidden `react-native-webview`:

- the WebView loads a tiny HTML page with `baseUrl: https://www.youtube.com/`, so InnerTube calls are same-origin and dodge CORS.
- it pulls `youtubei.js` + `bgutils-js` from a CDN and, on the device's residential IP, generates a **PO token** (BotGuard) and **deciphers** the signature / `n` parameter.
- a WebView is required because Hermes can't `eval` (BotGuard and the cipher both need it) and has no DOM.
- resolved stream URLs are posted back to RN over a small `postMessage` bridge (`src/extractors/youtube/bridge.ts`).

**downloading** uses ranged chunks. a plain full-file GET of a `googlevideo` URL is throttled to ~playback speed; pulling it in **4 MB ranges, 4 in parallel** (`CONCURRENCY = 4` in `download.ts`) — each a fresh request, written to disk in order, with per-chunk retry — restores full bandwidth. the pipeline picks the path per source: ranged chunks for progressive/DASH (YouTube included — the extractor deliberately uses the clients that hand back direct URLs), and HLS for `m3u8`, where segments are fetched **8–16 at a time** then remuxed (`hls.ts`). media-byte downloads run on their own parallel/retry path and are deliberately **not** gated (gating would throttle throughput). every temp file is tracked and cleaned up in a `finally`, even on cancel. (`youtubeSabr.ts` is a parked experiment for googlevideo's SABR protocol — currently off, `SABR_TEST = false`.)

**muxing** — YouTube's HD rungs are adaptive (separate video + audio), so the two streams are combined on-device with `ffmpeg-kit` (`-c copy`, no re-encode) in `src/lib/download/mux.ts`, and mp4 output gets **`+faststart`** so playback can start before the file's fully written. already-muxed low-res formats skip the mux; mp3 requests transcode (`libmp3lame -q:a 2`) for container compatibility, not quality. audio downloads also get **ID3 tags + embedded cover art** (`tagAudio`). HLS sources fetch segments in parallel (8–16 concurrent), then do a single `-c copy` remux instead of letting ffmpeg pull segments serially.

**saving** goes straight to the gallery through `expo-media-library` (`src/lib/download/save.ts`) — no folder picker, just a one-time permission — then fires a notification (`src/lib/notify.ts` + a `dataSync` foreground service in `fgservice.ts`) you can tap to open the file.

## Updates tab

a lightweight social surface backed by **Supabase**, separate from the download flow. it shows app updates (via `@tanstack/react-query`) and lets people react and comment. reacting, commenting, and liking require a **native Google sign-in** (`react-native-nitro-google-signin` → `supabase.auth.signInWithIdToken`, in `src/lib/social/googleAuth.ts`); signed-out users can read the feed but get a "Sign in with Google" button in place of the comment box. there's no anonymous path — tables + row-level security live in [`supabase/schema.sql`](supabase/schema.sql), and the RLS insert policies reject anonymous sessions. leave the Supabase env blank and the tab just shows a "not configured" state.

push notifications (comment replies, @mentions, likes, new-update broadcasts) + the in-app inbox are a separate FCM pipeline — setup, secrets, webhooks, and architecture in [`push-notifications.md`](../../docs/push-notifications.md).

## Stack

- **Expo ~56** / **React Native 0.85** — new architecture (required), Hermes
- **extraction:** `react-native-webview` (the YouTube sandbox) · `youtubei.js` + `bgutils-js` (loaded from CDN inside the WebView, not bundled) · `googlevideo` (SABR)
- **media:** `@nikhil-cephei/ffmpeg-kit-react-native` (on-device mux, `full-gpl`; see notes) · `expo-file-system` (chunked download + `File` API) · `react-native-blob-util`
- **save + notify:** `expo-media-library` (gallery) · `react-native-notify-kit` (notifications + foreground service)
- **ui / motion:** `twrnc` (styling) · `react-native-reanimated` 4 + `react-native-worklets` · `react-native-gesture-handler` · `@shopify/react-native-skia` · `lottie-react-native` · `react-native-svg` + `lucide-react-native` · `react-native-safe-area-context` · `react-native-screens` · `react-native-keyboard-controller`
- **data / auth:** `@supabase/supabase-js` · `@tanstack/react-query` · `react-native-nitro-google-signin` (+ `react-native-nitro-modules`) · `@react-native-async-storage/async-storage` · `expo-crypto`
- **observability:** `@sentry/react-native`

## Run it

```bash
npm install
cp .env.example .env      # fill in what you need — see Env below
npm start                 # Metro + dev client (bumps inotify watches on Termux)
```

JS changes — extractors, UI, download/mux logic — hot-reload over Metro. anything **native** (new modules, plugin/permission changes) needs a dev-client rebuild:

```bash
eas build --profile development --platform android
```

EAS profiles live in `eas.json`: `development` (dev client, internal apk), `preview` and `production` (internal/store apk, `arm64-v8a`). on-phone (Termux) builds skip the slow fingerprint step via `EAS_SKIP_AUTO_FINGERPRINT=1`. OTA JS updates ship through `expo-updates` (`runtimeVersion` follows `appVersion`) — but any **native** change needs a fresh build, not an OTA, so bump the version when you add a native module.

## Env

**every var is optional** — the app builds and downloads with an empty `.env`; each one just unlocks a feature. all vars are `EXPO_PUBLIC_*`, so they're **bundled into the app (public)**. full list with notes in [`.env.example`](.env.example). the ones that matter:

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — the Updates tab (blank = "not configured")
- `GOOGLE_WEB_CLIENT_ID` — native Google sign-in (the **web** OAuth client id; add the same id in Supabase → auth → providers → google)
- `TURSO_URL` / `TURSO_READ_TOKEN` — shared edge registry; the token **must be read-only** (it ships in the app)
- `SENTRY_DSN` — crash reporting · `DISABLE_FAST_RESOLVE=1` — bypass the resolve cache
- `YT_COOKIE` / `BILIBILI_COOKIE` — your logged-in session for authenticated extraction / 1080p+ → **personal builds only** (blank = anonymous / lower res)

**Spotify** isn't an app var — its credentials live server-side in the `spotify-token` Supabase Edge Function, so the secret never ships in the APK. Needs a Premium Spotify dev account (2026); deploy with `supabase secrets set SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=…` then `supabase functions deploy spotify-token`. Not deployed = Spotify resolves via the other sources (still works).

> security: the first four are public by design (DSN, anon key, OAuth client id, read-only token). `YT_COOKIE` and `BILIBILI_COOKIE` are real personal credentials — fine in a build you keep to yourself, but **leave them blank in a public release** or anyone can pull them from the APK.

## Testing

`npm test` runs Vitest (`mobile/tests/*.test.ts`, node env, network mocked via `vi.mock('../src/lib/net')`). on Termux run only the files you touched — the phantom killer will reap the whole suite. extractors **throw** typed `ExtractorError`, so tests assert `await expect(getInfo(...)).rejects.toThrow(/.../iu)` rather than checking for null. also `npm run typecheck` (`tsc --noEmit`) and `npm run lint:all` (`eslint .`). CI (`.circleci/config.yml`, `test-mobile`, node 22) runs typecheck → lint → vitest, only when `mobile/` changes.

## Layout

```bash
mobile/
├── App.tsx                       # root: tabs (home/settings/updates) + resolve/download orchestration
├── app.json · eas.json           # expo config (plugins) + EAS build profiles
├── plugins/                      # withLargeHeap · withNotificationIcon (config plugins)
├── supabase/schema.sql           # updates-tab tables + RLS
└── src/
    ├── screens/                  # HomeScreen · SettingsScreen · UpdatesScreen
    ├── extractors/
    │   ├── index.ts              # host -> extractor dispatch + resolve cache
    │   ├── types.ts · errors.ts  # VideoInfo/Format · typed ExtractorError
    │   ├── social.ts             # title / artist normalization
    │   ├── youtube/              # index (format ladder) · bridge (RN<->webview) · webviewSource (youtubei.js + potoken)
    │   ├── spotify/              # index · api (client-credentials)
    │   ├── facebook/ · threads/  # fetcher · parser · normalizer · json-extractor
    │   └── tiktok · x · instagram · bilibili · reddit · bluesky · soundcloud · vimeo · dailymotion
    ├── lib/
    │   ├── download/             # downloadPipeline (orchestrator) · download (4 MB ranged) · mux (ffmpeg-kit -c copy) · hls · youtubeSabr · save/gallery
    │   ├── social/               # supabase · googleAuth · updates(.logic) · registry (read-only turso)
    │   ├── net.ts                # gatedFetch — per-host concurrency + 429 backoff
    │   ├── notify.ts · fgservice.ts   # download notifications + foreground service
    │   ├── cache.ts · diskcache.ts · settings.ts
    │   └── format.ts · haptics.ts · crash.ts · retry.ts · tw.ts
    ├── hooks/                    # useDownload (download state machine) · useKeyboard · useScreenSize
    ├── components/               # PickerModal · BottomNav · CommentsPanel · Avatar · icons · hidden YouTubeExtractorWebView
    │   ├── sheets/               # BottomSheet · ErrorSheet · DownloadSuccessSheet · UpdateDetailSheet · ImageSheet · NotificationPermissionSheet
    │   └── backgrounds/          # DotPattern · ShootingStars · GridBackground · DotBackground
    └── types/                    # ambient .d.ts shims
```

## Notes

- **Android only, for now** — the `ffmpeg-kit` fork and `youtubei.js` both ship iOS code, but iOS is untested and unsupported here (no Apple developer account yet). `app.json` has no iOS config; `eas.json` builds APKs only.

- **styling is `twrnc`, not NativeWind** — NativeWind uses `lightningcss`, which has no prebuilt binary for Termux/aarch64 and won't build there, so this uses `twrnc` (runtime Tailwind) instead.

- **ffmpeg-kit** — the original `ffmpeg-kit-react-native` was retired in 2025; this uses a community fork that re-hosts the prebuilt binaries. it's the `full-gpl` build, so the app is effectively **GPL-3.0** (compatible with the repo's AGPL-3.0). the binaries are 4 KB-page aligned — fine for current devices, but a Play Store / 16 KB-page build would need a rebuilt `.aar`.

- **nitro Google sign-in** needs an `iosUrlScheme` value in `app.json` even though the app is Android-only — leave it out and prebuild throws. the value itself is a placeholder.

- **debugging YouTube** — flip `DEBUG = true` in `src/extractors/youtube/webviewSource.ts` to stream extraction steps to the Metro console. errors always log.
- this app borrows the web build's resolution ideas but shares no code with `backend/` — it's deliberately standalone so it can run with zero server.
