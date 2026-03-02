FROM node:20-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-full \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up yt-dlp in a virtual environment for isolation
RUN python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install -U yt-dlp
ENV PATH="/opt/yt-dlp-venv/bin:$PATH"

# Copy backend dependency files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install --production

# Copy backend source code
COPY backend/ .

# Ensure the temporary directory exists and is writable
RUN mkdir -p src/temp && chmod 777 src/temp

# Hugging Face Spaces defaults to port 7860
ENV PORT=7860
EXPOSE 7860

# Point node to our app's entry point relative to WORKDIR
CMD ["node", "src/app.js"]
