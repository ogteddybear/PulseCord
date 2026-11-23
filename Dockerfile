FROM node:22-bookworm-slim

# ffmpeg is used for audio transcoding. Install build tools because @discordjs/opus
# falls back to a native node-gyp build when no exact glibc prebuild is available.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 build-essential \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
       -o /usr/local/bin/yt-dlp \
    && chmod 0755 /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --include=dev --no-audit --no-fund

# Copy source after npm install so the stale repository lockfile cannot
# overwrite the reconciled lockfile in the build image.
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["npm", "start"]
