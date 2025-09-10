# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Copy source and ensure public exists (even if repo has none)
COPY . .
RUN mkdir -p public && npm run build

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

# Use the pre-existing non-root user provided by the node image
USER node

EXPOSE 3000
CMD ["node", "server.js"]
