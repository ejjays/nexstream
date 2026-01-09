FROM node:20-slim

# Install system dependencies: Python3 and FFmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp binary directly
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
RUN npm install --production

# Copy the rest of the app
COPY . .

# Ensure the temp directory exists and is writable
RUN mkdir -p temp && chmod 777 temp

# Render uses the PORT environment variable
EXPOSE 5000

CMD ["node", "index.js"]

