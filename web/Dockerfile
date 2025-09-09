# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Faster, cached installs
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
# Recommend: next.config.js should include `output: 'standalone'`
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Copy the standalone server output
COPY --from=builder /app/.next/standalone ./
# Static assets and public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Run as non-root
RUN addgroup -g 1001 -S nodegrp && adduser -S node -u 1001 -G nodegrp
USER 1001

EXPOSE 3000
# .next/standalone contains a server.js at project root we copied above
CMD ["node", "server.js"]
