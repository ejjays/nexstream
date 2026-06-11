#!/data/data/com.termux/files/usr/bin/bash
# hybrid watchdog: keeps phone yt-dlp service alive.
# publishes tunnel URL to Turso for backend delegation.

PORT=5055
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE="$BASE_DIR/scripts/tunnels/ytdlp-service.cjs"
LOGDIR="$HOME/.nexstream"
mkdir -p "$LOGDIR"
CF_LOG="$LOGDIR/ytdlp-cf.log"
SVC_LOG="$LOGDIR/ytdlp-service.log"
LAST_URL=""

termux-wake-lock 2>/dev/null || true

# load creds from backend/.env
if [ -f "$BASE_DIR/backend/.env" ]; then
  while IFS='=' read -r k v || [ -n "$k" ]; do
    case "$k" in ''|\#*) continue ;; esac
    v="${v%$'\r'}"; v="${v#\"}"; v="${v%\"}"; v="${v#\'}"; v="${v%\'}"
    export "$k=$v"
  done < "$BASE_DIR/backend/.env"
fi

if [ -z "$YTDLP_REMOTE_SECRET" ]; then
  echo "[ytdlp-keepalive] FATAL: set YTDLP_REMOTE_SECRET in backend/.env"
  exit 1
fi

if [ -n "$TURSO_URL" ] && [ -n "$TURSO_AUTH_TOKEN" ]; then
  DISCOVERY=1
  T_URL="$(echo "$TURSO_URL" | sed 's#libsql://#https://#')"
else
  DISCOVERY=0
  echo "[ytdlp-keepalive] warn: TURSO creds missing; URL won't be published"
fi

publish_url() {
  [ "$DISCOVERY" = "1" ] || return 0
  local url="$1" ts
  ts="$(date +%s)"
  curl -s -X POST "$T_URL/v2/pipeline" \
    -H "Authorization: Bearer $TURSO_AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"requests\":[{\"type\":\"execute\",\"stmt\":{\"sql\":\"INSERT OR REPLACE INTO configs (key, value, updated_at) VALUES ('YTDLP_SERVICE_URL', '$url', $ts)\"}},{\"type\":\"close\"}]}" >/dev/null \
    && echo "[ytdlp-keepalive] published YTDLP_SERVICE_URL=$url"
}

ensure_service() {
  pgrep -f "ytdlp-service.cjs" >/dev/null 2>&1 && return 0
  echo "[ytdlp-keepalive] (re)starting yt-dlp service..."
  ( YTDLP_SERVICE_PORT="$PORT" nohup node "$SERVICE" >"$SVC_LOG" 2>&1 & )
}

ensure_tunnel() {
  if ! pgrep -f "cloudflared tunnel --url http://localhost:$PORT" >/dev/null 2>&1; then
    echo "[ytdlp-keepalive] (re)starting cloudflared..."
    : > "$CF_LOG"
    nohup cloudflared tunnel --url "http://localhost:$PORT" >"$CF_LOG" 2>&1 &
    sleep 8
  fi
  local url
  url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | tail -1)"
  if [ -n "$url" ] && [ "$url" != "$LAST_URL" ]; then
    publish_url "$url"
    LAST_URL="$url"
  fi
}

# fetch youtube cookies for service
COOKIES_PATH="$LOGDIR/cookies.txt"
if [ -n "$COOKIES_URL" ] && curl -fsSL "$COOKIES_URL" -o "$COOKIES_PATH" 2>/dev/null; then
  export YTDLP_COOKIES_FILE="$COOKIES_PATH"
  echo "[ytdlp-keepalive] cookies fetched from COOKIES_URL"
else
  echo "[ytdlp-keepalive] no cookies (COOKIES_URL unset or fetch failed)"
fi

echo "[ytdlp-keepalive] watchdog started (yt-dlp service :$PORT + cloudflare)"
while true; do
  ensure_service
  ensure_tunnel
  sleep 20
done
