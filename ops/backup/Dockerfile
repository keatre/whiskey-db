FROM alpine:3.20

# Install dependencies at build time (no network needed at runtime)
RUN apk add --no-cache \
      restic \
      tzdata \
      ca-certificates

WORKDIR /app
COPY entrypoint.sh backup.sh /app/
RUN chmod +x /app/*.sh

ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]

