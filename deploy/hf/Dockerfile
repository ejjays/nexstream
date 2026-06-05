# Hugging Face Spaces (Docker SDK) build.
# Place this file as ./Dockerfile at the Space repo root,
# alongside shared/ and backend/ (build context = repo root).
FROM node:22-slim

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
# hadolint ignore=DL3008
RUN set -ex; \
    export DEBIAN_FRONTEND=noninteractive; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
    python3 python3-pip python3-full ffmpeg curl unzip; \
    rm -rf /var/lib/apt/lists/*

# yt-dlp toolchain in a world-readable venv
RUN python3 -m venv /opt/tool-venv \
    && /opt/tool-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/tool-venv/bin/pip install --no-cache-dir --upgrade --pre \
    yt-dlp kaggle yt-dlp-getpot-wpc

# reuse node user (uid 1000) hf expects
RUN mkdir -p /home/node/app && chown node:node /home/node/app
USER node
ENV HOME=/home/node \
    PATH=/home/node/.deno/bin:/opt/tool-venv/bin:/home/node/.local/bin:$PATH
WORKDIR $HOME/app

RUN curl -fsSL https://deno.land/install.sh | sh

# shared has its own deps (zod) the schemas need
COPY --chown=node:node shared/ ./shared/
RUN npm install --prefix shared

COPY --chown=node:node backend/package*.json ./backend/
WORKDIR $HOME/app/backend
RUN npm install

COPY --chown=node:node backend/ ./
RUN npx tsc

RUN mkdir -p temp

ENV PORT=7860 \
    API_ONLY=true \
    NODE_ENV=production
EXPOSE 7860

CMD ["node", "--import", "./dist/backend/src/instrument.js", "dist/backend/src/app.js"]
