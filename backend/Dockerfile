FROM node:20-slim

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

# Create a virtual environment and install yt-dlp
# specific date to bust cache and force update: 2026-01-11
RUN python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --upgrade pip \
    && /opt/yt-dlp-venv/bin/pip install -U yt-dlp

# Add the venv to the PATH so 'yt-dlp' is available directly
ENV PATH="/opt/yt-dlp-venv/bin:$PATH"

WORKDIR /app

# Create a non-root user for Hugging Face (ID 1000)
RUN useradd -m -u 1000 user

# Copy package files first
COPY package*.json ./
RUN npm install --production

# Copy the rest of the app
COPY . .

# Create temp dir and set permissions for the non-root user
# We change ownership of /app so 'user' can write to it
RUN mkdir -p temp/yt-dlp-cache \
    && chown -R user:user /app \
    && chmod -R 777 temp

# Switch to the non-root user
USER user

# Hugging Face expects port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["node", "index.js"]