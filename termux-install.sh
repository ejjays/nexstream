#!/bin/bash

# For termux users, run this: pkg install -y curl && curl -sL https://raw.githubusercontent.com/ejjays/nexstream/main/termux-install.sh | bash


echo "🚀 Starting NexStream Elite Setup..."

# dependencies
echo "📦 Installing System Packages (Python, FFmpeg, Node.js, Deno)..."
pkg update -y && pkg upgrade -y
pkg install -y python ffmpeg nodejs-lts git build-essential curl openssl-tool deno

echo "📥 Installing yt-dlp core..."
pip install yt-dlp

# setup project directory
DIR="nexstream"
if [ -d "$DIR" ]; then
    echo "📂 Directory exists. Updating..."
    cd "$DIR"
    git pull
else
    echo "🌐 Cloning NexStream..."
    git clone https://github.com/ejjays/nexstream.git
    cd "$DIR"
fi

# base path
BASE_PATH=$(pwd)

# 4. install frontend dep
echo "🛠 Building Frontend PWA..."
npm install
npm run build

# 5. Relocate Build for Backend (CRITICAL)
echo "🚚 Deploying UI to backend server..."
rm -rf backend/dist
mv dist backend/dist

# install backend dependencies
echo "📦 Installing Backend Dependencies..."
cd "$BASE_PATH/backend"
npm install

# environment setup
if [ ! -f .env ]; then
    echo "💡 Creating template .env file..."
    echo "GEMINI_API_KEY=your_google_ai_studio_key" > .env
    echo "GROQ_API_KEY=your_groq_key_optional" >> .env
fi

# start app
echo "✅ Setup Complete!"
echo "🌐 Open your browser and go to: http://localhost:5000"
echo "💡 IMPORTANT: Edit backend/.env to add your API keys!"
echo "💡 To stop the server, press CTRL + C"

npm start