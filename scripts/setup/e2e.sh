#!/bin/bash

# E2E test runner for termux 
# orchestrates host-side backend/tunnel & proot-side browser test
# NOTE: tunnels + proot are used to bypass android loopback sandboxing.
# without tunnel bridge, chromium in termux cant see local ports.

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CF_LOG="$BASE_DIR/cf_tunnel.log"
API_LOG="$BASE_DIR/backend.log"

echo "🏁 initializing e2e pipeline..."

# kill stale processes
pkill -f "cloudflared"
pkill -f "termux-shim.js"
rm -f "$CF_LOG" "$API_LOG"
touch "$CF_LOG"

# start backend
echo "booting api on host..."
cd "$BASE_DIR/backend" && PORT=5000 node scripts/termux-shim.js > "$API_LOG" 2>&1 &
API_PID=$!

# wait for backend
for i in {1..30}; do
    if grep -q "Routes ready" "$API_LOG"; then
        echo "backend ready"
        break
    fi
    sleep 1
done

# start tunnel
echo "opening cloudflare tunnel..."
"$BASE_DIR/scripts/tunnels/start-cloudflare.sh" >> "$CF_LOG" 2>&1 &
TUNNEL_PID=$!

# wait for tunnel url
echo -n "waiting for tunnel url"
MAX_RETRIES=60
COUNT=0
TUNNEL_URL=""

while [ $COUNT -lt $MAX_RETRIES ]; do
    TUNNEL_URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$CF_LOG" | head -n 1)
    if [ -n "$TUNNEL_URL" ]; then
        echo -e "\n🔗 tunnel live: $TUNNEL_URL"
        break
    fi
    echo -n "."
    sleep 2
    COUNT=$((COUNT + 1))
done

if [ -z "$TUNNEL_URL" ]; then
    echo -e "\n❌ error: tunnel timeout"
    kill $API_PID $TUNNEL_PID 2>/dev/null
    exit 1
fi

# execute browser test in proot
echo "starting chromium test (proot)..."
proot-distro login debian -- bash -l -c "cd \"$BASE_DIR\" && EXTERNAL_URL=\"$TUNNEL_URL\" npx tsx backend/tests/manual/e2e_extraction.ts"

# cleanup
echo "cleaning up..."
kill $API_PID $TUNNEL_PID 2>/dev/null
pkill -f "cloudflared"
pkill -f "termux-shim.js"
rm -f "$CF_LOG" "$API_LOG"

echo "✔️ done"
