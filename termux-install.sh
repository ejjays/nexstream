#!/bin/bash

echo "🚀 Starting NexStream Setup..."

# 1. Install System Dependencies
echo "📦 Installing System Packages (Python, FFmpeg, Node.js)..."
pkg update -y && pkg upgrade -y
pkg install -y python ffmpeg nodejs git build-essential curl openssl-tool

# 2. Setup Project Directory
DIR="nexstream"
if [ -d "$DIR" ]; then
    echo "📂 Directory exists. Updating..."
    cd $DIR
    git pull
else
    echo "mb Cloning NexStream..."
    git clone https://github.com/ejjays/nexstream.git
    cd $DIR
fi

# 3. Install Frontend Dependencies & Build
echo "mb Installing Frontend Dependencies..."
npm install
echo "🛠 Building Frontend PWA..."
npm run build

# 4. Install Backend Dependencies
echo "mb Installing Backend Dependencies..."
cd backend
npm install

# 5. Start the App
echo "✅ Setup Complete!"
echo "🌐 Open Google Chrome and go to: http://localhost:5000"
echo "💡 To stop the server, press CTRL + C"

npm start
