#!/bin/bash

# handle port
PORT=5000
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GOT_URL=0

# restart backend
if command -v pm2 >/dev/null; then
    pm2 restart nexstream-api || (cd "$BASE_DIR/backend" && pm2 start src/app.js --name nexstream-api)
else
    pkill -f "node src/app.js"
    cd "$BASE_DIR/backend" && node src/app.js >/dev/null 2>&1 &
fi

echo "starting cloudflare..."

# show url box then track usage
stdbuf -oL cloudflared tunnel --url http://localhost:$PORT 2>&1 | while read -r line; do
    if [[ $GOT_URL -eq 0 && "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
        URL="${BASH_REMATCH[1]}"
        echo ""
        echo "┌────────────────────────────────────────────────────────────┐"
        echo "  URL: $URL"
        echo "└────────────────────────────────────────────────────────────┘"
        echo ""
        GOT_URL=1
    fi
    
    # filter noise
    if [[ $GOT_URL -eq 1 ]]; then
        if [[ ! "$line" =~ "Version" ]] && \
           [[ ! "$line" =~ "Checksum" ]] && \
           [[ ! "$line" =~ "metrics" ]] && \
           [[ ! "$line" =~ "Your quick Tunnel" ]] && \
           [[ ! "$line" =~ "+---" ]] && \
           [[ ! "$line" =~ "Visit it at" ]] && \
           [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
           [[ ! "$line" =~ "Settings:" ]] && \
           [[ ! "$line" =~ "Autoupdate" ]] && \
           [[ ! "$line" =~ "Generated Connector ID" ]] && \
           [[ ! "$line" =~ "Initial protocol" ]] && \
           [[ ! "$line" =~ "ICMP proxy" ]] && \
           [[ ! "$line" =~ "ping_group_range" ]] && \
           [[ ! "$line" =~ "Tunnel connection curve" ]] && \
           [[ ! "$line" =~ "Registered tunnel connection" ]] && \
           [[ ! "$line" =~ "location=" ]] && \
           [[ ! "$line" =~ "https://" ]]; then
            echo "$line"
        fi
    fi
done
