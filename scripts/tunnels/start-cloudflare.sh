#!/bin/bash

# handle port
PORT=5000
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
    # format turso url for curl
    T_URL=$(echo $TURSO_URL | sed 's/libsql:\/\//https:\/\//')
fi

# restart backend
if command -v pm2 >/dev/null; then
    pm2 restart nexstream-api --silent >/dev/null 2>&1 || (cd "$BASE_DIR/backend" && pm2 start src/app.js --name nexstream-api --silent >/dev/null 2>&1)
else
    pkill -f "node src/app.js"
    cd "$BASE_DIR/backend" && node src/app.js >/dev/null 2>&1 &
fi

echo "starting cloudflare..."

# show url box then track usage
stdbuf -oL cloudflared tunnel --url http://localhost:$PORT 2>&1 | while read -r line; do
    # extract url
    if [[ $GOT_URL -eq 0 && "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
        URL="${BASH_REMATCH[1]}"
        echo ""
        echo "┌────────────────────────────────────────────────────────────┐"
        echo "  URL: $URL"
        echo "└────────────────────────────────────────────────────────────┘"
        echo ""
        GOT_URL=1

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
            echo "✅ Service Discovery: updated Turso"
        fi
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
