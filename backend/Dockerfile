FROM node:22-slim

WORKDIR /app

# Install dependencies
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
# pinned patch versions vanish on debian updates
# hadolint ignore=DL3008
RUN set -ex; \
    export DEBIAN_FRONTEND=noninteractive; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-full \
    ffmpeg \
    curl \
    unzip; \
    curl -fsSL https://deno.land/install.sh | sh; \
    rm -rf /var/lib/apt/lists/*

# PATH
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# yt-dlp & kaggle setup
RUN python3 -m venv /opt/tool-venv \
    && /opt/tool-venv/bin/pip install --upgrade pip \
    && /opt/tool-venv/bin/pip install --upgrade --pre yt-dlp kaggle yt-dlp-getpot-wpc
ENV PATH="/opt/tool-venv/bin:$PATH"

RUN echo "Deploying Backend Only - Optimized for Koyeb"

# shared sits beside backend so tsc emits dist/backend + dist/shared
COPY shared/ ./shared/
COPY backend/package*.json ./backend/

WORKDIR /app/backend
# full install so tsc (devDep) is available to build
RUN npm install

# workdir is already /app/backend; copy source into it
COPY backend/ ./

# compile typescript; fails build on type error
RUN npx tsc

RUN mkdir -p temp && chmod 777 temp

ENV PORT=8000
ENV API_ONLY=true
EXPOSE 8000

# preload instrument for sentry, run compiled entry
CMD ["node", "--import", "./dist/backend/src/instrument.js", "dist/backend/src/app.js"]
