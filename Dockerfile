FROM node:22-bookworm-slim

# ffmpeg is used for audio transcoding. Install the current yt-dlp standalone
# binary because distro packages can lag behind YouTube changes.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
       -o /usr/local/bin/yt-dlp \
    && chmod 0755 /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["npm", "start"]
