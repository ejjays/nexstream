FROM node:20

# Install system dependencies: Python3, FFmpeg, and Deno
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-full \
    ffmpeg \
    curl \
    unzip \
    iputils-ping \
    dnsutils \
    && curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip -o deno.zip \
    && unzip deno.zip \
    && mv deno /usr/bin/deno \
    && rm deno.zip \
    && rm -rf /var/lib/apt/lists/*

# Deno is now in /usr/bin/deno


# Create a virtual environment and install yt-dlp
# specific date to bust cache and force update: 2026-01-11
RUN python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --upgrade pip \
    && /opt/yt-dlp-venv/bin/pip install -U yt-dlp

# Add the venv to the PATH so 'yt-dlp' is available directly
ENV PATH="/opt/yt-dlp-venv/bin:$PATH"

WORKDIR /app

# Copy package files first
COPY package*.json ./
RUN npm install --production

# Copy the rest of the app
COPY . .

# Ensure temp directory exists and is writable by ANY user
# (Koyeb and HF use different non-root users)
RUN mkdir -p temp/yt-dlp-cache \
    && chmod -R 777 /app \
    && chmod -R 777 temp

# Use the dynamic PORT env var (Default to 8000 for Koyeb)
ENV PORT=8000
EXPOSE 8000

CMD ["node", "index.js"]