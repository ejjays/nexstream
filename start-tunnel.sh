#!/bin/bash

# NexStream Ngrok Tunnel Helper
# Domain: spikier-acinaceous-keenan.ngrok-free.dev

echo "--- Starting NexStream Backend & Ngrok ---"

# Ensure proot is installed for DNS fix
if ! command -v termux-chroot &> /dev/null; then
    echo "Installing proot to fix DNS issues..."
    pkg install proot -y
fi

# Start the backend in the background using PM2 if available, or just node
if command -v pm2 &> /dev/null
then
    if pm2 list | grep -q "nexstream-api"; then
        echo "✅ Backend is already running (PM2)."
    else
        cd backend && pm2 start main.js --name nexstream-api
        echo "✅ Backend started (PM2)."
    fi
else
    cd backend && node main.js &
    echo "✅ Backend started (Node background process)."
fi

echo ""
echo "🚀 Establishing Tunnel..."
echo "Your API URL is: https://spikier-acinaceous-keenan.ngrok-free.dev"
echo "Press Ctrl+C to stop the tunnel (backend will keep running)"
echo ""

# Start ngrok inside termux-chroot to fix DNS resolution
# We use termux-chroot because Android/Termux has issues resolving external domains
# without a proper /etc/resolv.conf, which termux-chroot provides.
termux-chroot ./ngrok http --url=spikier-acinaceous-keenan.ngrok-free.dev 5000 > ngrok_output.log 2>&1 &
NGROK_PID=$!

# Wait for a moment to see if it crashes
sleep 5

# Check if the process is still running
if ps -p $NGROK_PID > /dev/null
then
    echo "✅ Tunnel process started (PID: $NGROK_PID)"
    
    # Check if we can reach the local API (inside chroot this might be tricky, so we check from outside)
    if curl -s http://127.0.0.1:4040/api/tunnels | grep -q "spikier"; then
        echo "✅ Tunnel verified active via API!"
    else
        echo "⚠️  Tunnel process is running, but API check failed."
        echo "This might be a delay. Check the URL in your browser:"
        echo "https://spikier-acinaceous-keenan.ngrok-free.dev"
        echo ""
        echo "Latest logs:"
        tail -n 5 ngrok_output.log
    fi
    # Keep script running
    wait $NGROK_PID
else
    echo "❌ Tunnel failed to start!"
    echo "Error Log:"
    cat ngrok_output.log
fi