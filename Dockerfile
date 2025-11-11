########################################
# Stage 1: Build the Next.js frontend  #
########################################
FROM node:20-bullseye AS web-builder

ARG NEXT_PUBLIC_API_BASE=/api
ARG NEXT_BACKEND_ORIGIN=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE \
    NEXT_BACKEND_ORIGIN=$NEXT_BACKEND_ORIGIN \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /src/web

COPY web/package*.json ./
RUN npm ci --include=dev

COPY web/ ./
ENV NODE_ENV=production
RUN npm run build

########################################
# Stage 2: Final runtime image         #
########################################
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
         bash \
         busybox \
         ca-certificates \
         coreutils \
         curl \
         gnupg \
         procps \
         restic \
         tzdata \
         tini \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x (needed to run the built Next.js app)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Provide crond via busybox (script expects `crond` on PATH)
RUN ln -sf /bin/busybox /usr/bin/crond \
    && mkdir -p /etc/crontabs

WORKDIR /srv

ENV LOGGING_DIR=/logging \
    WEB_DIR=/srv/web \
    API_DIR=/srv/api \
    BACKUP_ENTRYPOINT=/srv/backup/entrypoint.sh \
    NEXT_PUBLIC_API_BASE=/api \
    NEXT_BACKEND_ORIGIN=http://127.0.0.1:8000 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# Install API dependencies before copying the full source for better caching
COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r ./api/requirements.txt

# Copy application code
COPY api ./api

# Copy built frontend artifacts
COPY --from=web-builder /src/web/.next ./web/.next
COPY --from=web-builder /src/web/node_modules ./web/node_modules
COPY --from=web-builder /src/web/package*.json ./web/
COPY --from=web-builder /src/web/public ./web/public
COPY --from=web-builder /src/web/next.config.mjs ./web/

# Runtime scripts and helpers
COPY ops/logging /logging
COPY ops/backup /srv/backup
COPY ops/runtime/start-services.sh /srv/scripts/start-services.sh

RUN chmod +x /logging/*.sh \
    && chmod +x /srv/backup/*.sh \
    && chmod +x /srv/scripts/start-services.sh

EXPOSE 3000 8000

ENTRYPOINT ["/usr/bin/tini", "--", "/srv/scripts/start-services.sh"]
