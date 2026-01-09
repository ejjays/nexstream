FROM node:20-slim

# Install system dependencies: Python3 and FFmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-full \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create a virtual environment and install yt-dlp
RUN python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --upgrade pip \
    && /opt/yt-dlp-venv/bin/pip install yt-dlp

# Add the venv to the PATH so 'yt-dlp' is available directly
ENV PATH="/opt/yt-dlp-venv/bin:$PATH"

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