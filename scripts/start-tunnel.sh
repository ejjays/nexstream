#!/bin/bash

DOMAIN="spikier-acinaceous-keenan.ngrok-free.dev"

echo "starting backend..."

command -v termux-chroot >/dev/null || pkg install proot -y

if command -v pm2 >/dev/null; then
    if pm2 list | grep -q "nexstream-api"; then
        echo "api already running on pm2"
    else
        cd backend && pm2 start src/app.js --name nexstream-api
    fi
else
    cd backend && node src/app.js &
fi

cd ..

echo "tunnel: https://$DOMAIN"
termux-chroot ngrok http --domain=$DOMAIN 5000 > ngrok_output.log 2>&1 &
PID=$!

sleep 5

if ps -p $PID >/dev/null; then
    echo "tunnel active (pid: $PID)"
    wait $PID
else
    echo "tunnel failed to start"
    cat ngrok_output.log
fi
