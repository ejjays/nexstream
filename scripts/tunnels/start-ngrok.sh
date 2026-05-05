#!/bin/bash

# handle port
PORT=5000
DOMAIN="spikier-acinaceous-keenan.ngrok-free.dev"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
NGROK_BIN="$SCRIPT_DIR/ngrok"
GOT_URL=0

# load turso env
if [ -f "$BASE_DIR/backend/.env" ]; then
    export $(grep -v '^#' "$BASE_DIR/backend/.env" | xargs)
fi

# check for turso
if [ -z "$TURSO_URL" ] || [ -z "$TURSO_AUTH_TOKEN" ]; then
    echo "⚠️ Turso env missing, service discovery disabled."
    DISCOVERY=0
else
    DISCOVERY=1
    T_URL=$(echo $TURSO_URL | sed 's/libsql:\/\//https:\/\//')
fi

echo "starting backend..."

command -v termux-chroot >/dev/null || pkg install proot -y

if command -v pm2 >/dev/null; then
    pm2 restart nexstream-api --silent >/dev/null 2>&1 || (cd "$BASE_DIR/backend" && pm2 start src/app.js --name nexstream-api --silent >/dev/null 2>&1)
else
    pkill -f "node src/app.js"
    cd "$BASE_DIR/backend" && node src/app.js >/dev/null 2>&1 &
fi

echo "starting ngrok..."
URL="https://$DOMAIN"

# update turso
if [ $DISCOVERY -eq 1 ]; then
    TS=$(date +%s)
    curl -s -X POST "$T_URL/v2/pipeline" \
        -H "Authorization: Bearer $TURSO_AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"requests\": [
                { \"type\": \"execute\", \"stmt\": { \"sql\": \"INSERT OR REPLACE INTO configs (key, value, updated_at) VALUES ('BACKEND_URL', '$URL', $TS)\" } },
                { \"type\": \"close\" }
            ]
        }" > /dev/null
    echo "✅ Service Discovery: updated Turso ($URL)"
fi

echo "┌────────────────────────────────────────────────────────────┐"
echo "  URL: $URL"
echo "└────────────────────────────────────────────────────────────┘"

termux-chroot "$NGROK_BIN" http --domain=$DOMAIN $PORT > ngrok_output.log 2>&1
