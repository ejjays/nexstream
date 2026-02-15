FROM node:20-slim

# Set working directory to /app
WORKDIR /app

# Install system dependencies: Python3, FFmpeg, and Deno
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-full \
    ffmpeg \
    curl \
    unzip \
    && curl -fsSL https://deno.land/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

# Add Deno to PATH
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Setup yt-dlp in a virtual environment
RUN python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --upgrade pip \
    && /opt/yt-dlp-venv/bin/pip install -U yt-dlp
ENV PATH="/opt/yt-dlp-venv/bin:$PATH"

# CACHE BUSTER: 2026-02-16
RUN echo "Deploying Backend Only - Optimized for Koyeb"

# Copy backend dependency files
COPY backend/package*.json ./
RUN npm install --production

# Copy backend source code
COPY backend/ .

# Ensure temp directory exists for media processing
RUN mkdir -p temp && chmod 777 temp

# Environment setup
ENV PORT=5000
EXPOSE 5000

# Start the application
CMD ["node", "main.js"]
