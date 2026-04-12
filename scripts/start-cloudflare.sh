#!/bin/bash
# scripts/start-cloudflare.sh

# handle port
PORT=5000
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "starting backend..."

# check pm2
if command -v pm2 >/dev/null; then
    if pm2 list | grep -q "nexstream-api"; then
        pm2 restart nexstream-api
    else
        cd "$BASE_DIR/backend" && pm2 start src/app.js --name nexstream-api
    fi
else
    pkill -f "node src/app.js"
    cd "$BASE_DIR/backend" && node src/app.js &
fi

echo "starting cloudflare..."

# launch tunnel
cloudflared tunnel --url http://localhost:$PORT
