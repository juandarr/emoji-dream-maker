# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS base
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY . .
ARG NEXT_PUBLIC_GIPHY_API_KEY=""
ENV NEXT_TELEMETRY_DISABLED=1
# Disposable build configuration; private production values never enter the build.
RUN BETTER_AUTH_SECRET=build-only-auth-secret-at-least-32-characters \
    BETTER_AUTH_URL=http://localhost:3000 ACCOUNT_DB_PATH=/tmp/build-accounts.sqlite \
    INVITATION_PHRASE=build-only-invitation INVITATION_EMOJI_ID=1F419 \
    NEXT_PUBLIC_GIPHY_API_KEY="$NEXT_PUBLIC_GIPHY_API_KEY" npm run build

FROM base AS runtime
ARG APP_REVISION=development
LABEL org.opencontainers.image.source="https://github.com/juandarr/emoji-dream-maker" \
      org.opencontainers.image.account-schema="3" \
      org.opencontainers.image.revision="$APP_REVISION"
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 \
    APP_REVISION="$APP_REVISION" ACCOUNT_DB_PATH=/data/accounts.sqlite \
    YOUTUBE_CACHE_DIR=/cache/youtube YTDLP_PATH=/opt/yt-dlp/yt-dlp \
    YTDLP_PYTHON_ARCHIVE=/opt/yt-dlp/yt-dlp YTDLP_PYTHON=python3
COPY deploy/yt-dlp.lock.json deploy/fetch-ytdlp.py /tmp/yt-dlp-setup/
RUN python3 /tmp/yt-dlp-setup/fetch-ytdlp.py && rm -rf /tmp/yt-dlp-setup \
    && groupadd --gid 10001 dreammaker && useradd --uid 10001 --gid 10001 --no-create-home dreammaker \
    && mkdir -p /data /cache/youtube && chown -R 10001:10001 /data /cache && chmod 700 /data
COPY --from=build --chown=10001:10001 /app/.next/standalone ./
COPY --from=build --chown=10001:10001 /app/.next/static ./.next/static
COPY --from=build --chown=10001:10001 /app/public ./public
COPY --chown=10001:10001 scripts/ytdlp-worker.py scripts/account-backup.mjs scripts/account-check.mjs scripts/healthcheck.mjs ./scripts/
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=3 CMD ["node", "scripts/healthcheck.mjs"]
CMD ["node", "server.js"]
