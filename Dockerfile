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

# Set up yt-dlp in a virtual environment
RUN python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install -U yt-dlp
ENV PATH="/opt/yt-dlp-venv/bin:$PATH"

# Copy package files from the root (since backend is now at the root)
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy the rest of the backend source (now at root)
COPY . .

# Ensure the temp directory exists and is writable
RUN mkdir -p src/temp && chmod 777 src/temp

# Hugging Face Spaces port
ENV PORT=7860
EXPOSE 7860

CMD ["node", "src/app.js"]