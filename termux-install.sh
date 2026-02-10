#!/bin/bash

echo "🚀 Starting NexStream Elite Setup..."

# 1. Install System Dependencies
echo "📦 Installing System Packages (Python, FFmpeg, Node.js, Deno)..."
pkg update -y && pkg upgrade -y
pkg install -y python ffmpeg nodejs-lts git build-essential curl openssl-tool deno

# 2. Install yt-dlp via Pip (CRITICAL)
echo "📥 Installing yt-dlp core..."
pip install yt-dlp

# 3. Setup Project Directory
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

# Store the base path
BASE_PATH=$(pwd)

# 4. Install Frontend Dependencies & Build
echo "🛠 Building Frontend PWA..."
npm install
npm run build

# 5. Relocate Build for Backend (CRITICAL)
echo "🚚 Deploying UI to backend server..."
rm -rf backend/dist
mv dist backend/dist

# 6. Install Backend Dependencies
echo "📦 Installing Backend Dependencies..."
cd "$BASE_PATH/backend"
npm install

# 7. Environment Setup
if [ ! -f .env ]; then
    echo "💡 Creating template .env file..."
    echo "GEMINI_API_KEY=your_google_ai_studio_key" > .env
    echo "GROQ_API_KEY=your_groq_key_optional" >> .env
fi

# 8. Start the App
echo "✅ Setup Complete!"
echo "🌐 Open your browser and go to: http://localhost:5000"
echo "💡 IMPORTANT: Edit backend/.env to add your API keys!"
echo "💡 To stop the server, press CTRL + C"

npm start