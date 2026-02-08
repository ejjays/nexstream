# STAGE 1: Build Frontend
FROM node:20-slim AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# STAGE 2: Production Backend
FROM node:20-slim
# NEW WORKDIR to kill cache
WORKDIR /prod_app_v2

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

# CACHE BUSTER: 2026-02-08-T21:20
RUN echo "Fresh Build Triggered"

# Setup Backend
COPY backend/package*.json ./
RUN npm install --production
# COPY ALL backend files (including the renamed main.js)
COPY backend/ .

# Copy Built Frontend
COPY --from=build-stage /app/dist ./dist

# Setup temp directory
RUN mkdir -p temp && chmod 777 temp

# Ensure the app binds correctly
ENV PORT=5000
EXPOSE 5000

# Run the renamed main.js
CMD ["node", "main.js"]