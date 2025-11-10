# ---- Build stage ----
FROM node:20-alpine AS builder
ARG NEXT_PUBLIC_API_BASE=/api
ARG NEXT_BACKEND_ORIGIN=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE \
    NEXT_BACKEND_ORIGIN=$NEXT_BACKEND_ORIGIN
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
ARG NEXT_PUBLIC_API_BASE=/api
ARG NEXT_BACKEND_ORIGIN=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE \
    NEXT_BACKEND_ORIGIN=$NEXT_BACKEND_ORIGIN

RUN apk add --no-cache bash

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.mjs ./next.config.mjs

USER node

EXPOSE 3000
CMD ["npm", "run", "start"]
