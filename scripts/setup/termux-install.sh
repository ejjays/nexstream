#!/bin/bash
set -e

echo "installing dependencies..."

pkg update -y && pkg upgrade -y
pkg install -y python ffmpeg nodejs-lts git build-essential curl openssl-tool deno
pip install yt-dlp

if [ -d "nexstream" ]; then
    cd nexstream && git pull
else
    git clone https://github.com/ejjays/nexstream.git && cd nexstream
fi

BASE=$(pwd)

# root tooling (also activates the git pre-commit hooks via `prepare`)
npm install --silent

# install + build the backend (tsc -> backend/dist; `npm start` runs from there)
cd "$BASE/backend"
npm install --silent
npm run build --silent

if [ ! -f .env ]; then
    echo "GEMINI_API_KEY=your_key_here" > .env
    echo "GROQ_API_KEY=" >> .env
fi

echo "setup complete."
npm start
