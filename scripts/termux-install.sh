#!/bin/bash
set -e

# NexStream Local Provisioning Script for Termux
# Usage: curl -sL https://raw.githubusercontent.com/ejjays/nexstream/main/termux-install.sh | bash

echo "--- NexStream: Initializing Setup ---"

echo "Provisioning system packages..."
pkg update -y && pkg upgrade -y
pkg install -y python ffmpeg nodejs-lts git build-essential curl openssl-tool deno

echo "Syncing yt-dlp binary..."
pip install yt-dlp

DIR="nexstream"
if [ -d "$DIR" ]; then
    echo "Existing installation found. Pulling updates..."
    cd "$DIR"
    git pull
else
    echo "Cloning repository..."
    git clone https://github.com/ejjays/nexstream.git
    cd "$DIR"
fi

BASE_PATH=$(pwd)

echo "Building production assets..."
npm install --silent
npm run build --silent

echo "Linking build artifacts to core..."
rm -rf backend/dist
mv dist backend/dist

echo "Initializing backend environment..."
cd "$BASE_PATH/backend"
npm install --silent

if [ ! -f .env ]; then
    echo "Generating .env template..."
    echo "GEMINI_API_KEY=your_key_here" > .env
    echo "GROQ_API_KEY=" >> .env
fi

echo ""
echo "✅ Installation successful."
echo "Entry point: http://localhost:5000"
echo "Action required: Configure backend/.env with your API keys."
echo "Press CTRL+C to terminate the process."
echo ""

npm start
