FROM node:20-slim

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-full \
    ffmpeg \
    curl \
    unzip \
    && curl -fsSL https://deno.land/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

# PATH
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# yt-dlp setup
RUN python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --upgrade pip \
    && /opt/yt-dlp-venv/bin/pip install -U yt-dlp
ENV PATH="/opt/yt-dlp-venv/bin:$PATH"

RUN echo "Deploying Backend Only - Optimized for Koyeb"

COPY backend/package*.json ./
RUN npm install --production

COPY backend/ .

RUN mkdir -p temp && chmod 777 temp

ENV PORT=8000
EXPOSE 8000

CMD ["node", "src/app.js"]
