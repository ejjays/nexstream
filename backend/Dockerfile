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

# The 'node' image already has a user named 'node' with UID 1000.
# We don't need to create a new user, just use the existing one.

# Copy package files first
COPY package*.json ./
RUN npm install --production

# Copy the rest of the app
COPY . .

# Create temp dir and set permissions for the 'node' user
# We change ownership of /app so 'node' can write to it
RUN mkdir -p temp/yt-dlp-cache \
    && chown -R node:node /app \
    && chmod -R 777 temp

# Switch to the existing non-root user 'node'
USER node

# Hugging Face expects port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["node", "index.js"]