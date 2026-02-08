# STAGE 1: Build Frontend
FROM node:20-slim AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# STAGE 2: Production Backend
FROM node:20-slim
WORKDIR /app

# Install system dependencies
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

# Setup yt-dlp
RUN python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --upgrade pip \
    && /opt/yt-dlp-venv/bin/pip install -U yt-dlp
ENV PATH="/opt/yt-dlp-venv/bin:$PATH"

# Setup Backend (FLATTENED STRUCTURE)
# We put everything in /app so that dist/ and backend/ are siblings
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ .

# Copy Built Frontend from Stage 1 to /app/dist
COPY --from=build-stage /app/dist ./dist

# Setup temp directory
RUN mkdir -p temp && chmod 777 temp

# Koyeb/Render use the PORT env var
ENV PORT=5000
EXPOSE 5000

CMD ["node", "index.js"]