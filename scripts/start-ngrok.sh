#!/bin/bash

DOMAIN="spikier-acinaceous-keenan.ngrok-free.dev"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
NGROK_BIN="$SCRIPT_DIR/ngrok"

echo "starting backend..."

command -v termux-chroot >/dev/null || pkg install proot -y

if command -v pm2 >/dev/null; then
    if pm2 list | grep -q "nexstream-api"; then
        echo "restarting backend on pm2..."
        pm2 restart nexstream-api
    else
        cd "$BASE_DIR/backend" && pm2 start src/app.js --name nexstream-api
    fi
else
    pkill -f "node src/app.js"
    cd "$BASE_DIR/backend" && node src/app.js &
fi

cd "$BASE_DIR"

echo "tunnel: https://$DOMAIN"
termux-chroot "$NGROK_BIN" http --domain=$DOMAIN 5000 > ngrok_output.log 2>&1 &
PID=$!

sleep 5

if ps -p $PID >/dev/null; then
    echo "tunnel active (pid: $PID)"
    wait $PID
else
    echo "tunnel failed to start"
    cat ngrok_output.log
fi
