# NexStream — Android

native Android app, built with Expo (React Native 0.85, Hermes, new architecture). it does the whole flow on the phone — resolve, download, mux, save — and talks to no backend at all.

## Why I built this

honestly, this started because the web version kept hitting walls on free hosting. the backend runs on free Koyeb box, and two things kept breaking it: YouTube bot blocks datacenter IPs, so extraction from Koyeb gets walled; and free tier has so little memory that `yt-dlp` & `ffmpeg` OOMs it constantly, not good for production.

my workaround was a hybrid setup — my phone on home wifi acts like a residential worker the backend calls out for `yt-dlp` and media relay (see [`phone-worker-setup.md`](../../docs/phone-worker-setup.md)). it works, but I wouldnt trust it in production: the worker phone can drop wifi, run out of battery, or just get killed by phantom killer, and I dont have dedicated spare device to keep it alive 24/7. tried free tier residential proxies would fix the IP problem, but they're expensive and limited this is meant to stay free and ad-free.

so instead of fighting the server, the whole thing moves onto the phone that's already running the app. each user's device is its own residential IP and does its own extraction, download, and mux — nothing to OOM, no proxy bill, and no single worker phone to babysit.

## How it works

every source resolves to a common `VideoInfo` shape (`src/extractors/types.ts`), then the picker hands the chosen format to the download pipeline.

**pure-JS extractors** — supported platforms under `src/extractors/` that fetches the page/API directly and parses the stream URLs out of the embedded JSON (with a regex fallback). **everything is pure JS — no `yt-dlp`.**

**YouTube** is the hard one, so it runs inside a hidden `react-native-webview`:

- the WebView loads a tiny HTML page with `baseUrl: https://www.youtube.com/`, so InnerTube calls are same-origin and dodge CORS.
- it pulls `youtubei.js` + `bgutils-js` from a CDN and, on the device's residential IP, generates a **PO token** (BotGuard) and **deciphers** the signature / `n` parameter.
- a WebView is required because Hermes can't `eval` (BotGuard and the cipher both need it) and has no DOM.
- resolved stream URLs are posted back to RN over a small `postMessage` bridge (`src/extractors/youtube/bridge.ts`).

**downloading** uses ranged chunks. a plain full-file GET of a `googlevideo` URL is throttled to ~playback speed; requesting in **8 MB ranges** — a fresh request each — gets full speed. it's the same trick the backend's chunked fetcher uses. see `src/lib/download.ts`.

**muxing** — YouTube's HD rungs are adaptive (separate video + audio), so the two streams are combined on-device with `ffmpeg-kit` (`-c copy`, no re-encode) in `src/lib/mux.ts`. already-muxed low-res formats skip this entirely.

**saving** goes straight to the gallery through `expo-media-library` (`src/lib/save.ts`) — no folder picker, just a one-time permission.

## Stack

- **Expo 56** / **React Native 0.85** — new architecture, Hermes
- `react-native-webview` — the sandbox for the YouTube extractor
- `youtubei.js` + `bgutils-js` — loaded from CDN inside the WebView (not bundled)
- `expo-file-system` — chunked download + file handles
- `@nikhil-cephei/ffmpeg-kit-react-native` — on-device mux (`full-gpl`; see notes)
- `expo-media-library` — gallery saves
- `twrnc` for styling, `react-native-reanimated` + `lottie-react-native` for motion, `react-native-safe-area-context` for insets

## Run it

```bash
npm install
npx expo start            # Metro; open in a dev client
```

JS changes — extractors, UI, download/mux logic — hot-reload over Metro. anything **native** (`expo-media-library`, `lottie-react-native`, `ffmpeg-kit`) needs a dev-client rebuild:

```bash
eas build --profile development --platform android
```

on-phone (Termux) builds: the fingerprint step is slow, so the dev profile sets `EAS_SKIP_AUTO_FINGERPRINT=1` (see `eas.json`).

## Layout

```bash
android/
├── App.tsx                       # entry: input, resolve, download/mux/save
└── src/
    ├── extractors/
    │   ├── index.ts              # url -> platform router
    │   ├── types.ts              # shared VideoInfo / Format
    │   ├── social.ts             # title / artist normalization
    │   ├── facebook/ · threads/  # html + json extractors
    │   ├── tiktok.ts · x.ts      # api extractors
    │   └── youtube/
    │       ├── index.ts          #   format ladder -> VideoInfo
    │       ├── bridge.ts         #   RN <-> webview promise bridge
    │       └── webviewSource.ts  #   youtubei.js + potoken (runs in webview)
    ├── components/               # PickerModal, hidden YouTubeExtractorWebView, Header, BottomNav, GlowButton
    └── lib/
        ├── download.ts           # chunked ranged downloader
        ├── mux.ts                # ffmpeg-kit -c copy
        ├── save.ts               # gallery save
        └── format.ts · tw.ts     # helpers + tailwind config
```

## Notes

- **ffmpeg-kit** — the original `ffmpeg-kit-react-native` was retired in 2025; this uses a community fork that re-hosts the prebuilt binaries. it's the `full-gpl` build, so the app is effectively **GPL-3.0** (compatible with the repo's AGPL-3.0). the binaries are 4 KB-page aligned — fine for current devices, but a Play Store / 16 KB-page build would need a rebuilt `.aar`.
- **Android only, for now** — the `ffmpeg-kit` fork and `youtubei.js` both ship iOS code, but iOS is untested and unsupported here (no Apple developer account yet).
- **styling is `twrnc`, not NativeWind** — NativeWind pulls in `lightningcss`, which has no prebuilt binary for Termux/aarch64 and won't build there, so this uses `twrnc` (runtime Tailwind) instead.
- **debugging YouTube** — flip `DEBUG = true` in `src/extractors/youtube/webviewSource.ts` to stream extraction steps to the Metro console. errors always log.
- this app borrows the web build's resolution ideas but shares no code with `backend/` — it's deliberately standalone so it can run with zero server.
