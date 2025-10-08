#!/usr/bin/env bash
set -euo pipefail

SERVICE=${1:-unknown}
LEVEL=${2:-info}

# Preserve original stream (stdout vs stderr)
STREAM=${LOG_STREAM:-stdout}

LOG_FILE_PATH=${LOG_FILE_PATH:-/logs/whiskey_db.log}
LOG_LEVEL=${LOG_LEVEL:-info}
LOG_MAX_MB=${LOG_MAX_MB:-10}
LOG_RETENTION_DAYS=${LOG_RETENTION_DAYS:-14}
LOG_ECHO=${LOG_ECHO:-1}
PUID=${PUID:-}
PGID=${PGID:-}

normalize() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

LEVEL_NORM=$(normalize "$LEVEL")
LOG_LEVEL_NORM=$(normalize "$LOG_LEVEL")

case "$LEVEL_NORM" in
  error) MESSAGE_LEVEL=1 ;;
  warn|warning) MESSAGE_LEVEL=2 ;;
  info) MESSAGE_LEVEL=3 ;;
  debug|trace) MESSAGE_LEVEL=4 ;;
  *) MESSAGE_LEVEL=3 ;;
esac

case "$LOG_LEVEL_NORM" in
  none)   THRESHOLD=0 ;;
  error)  THRESHOLD=1 ;;
  warn|warning) THRESHOLD=2 ;;
  info)   THRESHOLD=3 ;;
  debug|trace)  THRESHOLD=4 ;;
  *)      THRESHOLD=3 ;;
esac

# Convert megabytes to bytes (fallback 10MB)
if [[ "$LOG_MAX_MB" =~ ^[0-9]+$ ]]; then
  MAX_BYTES=$((LOG_MAX_MB * 1024 * 1024))
else
  MAX_BYTES=$((10 * 1024 * 1024))
fi

if [[ "$LOG_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  RETENTION_DAYS=$LOG_RETENTION_DAYS
else
  RETENTION_DAYS=14
fi

DIRNAME=$(dirname "$LOG_FILE_PATH")
BASENAME=$(basename "$LOG_FILE_PATH")
LOCK_FILE="${LOG_FILE_PATH}.lock"

mkdir -p "$DIRNAME"
touch "$LOCK_FILE"
if [ -n "$PUID" ] && [ -n "$PGID" ]; then
  chown "$PUID":"$PGID" "$LOCK_FILE" 2>/dev/null || true
fi

# Open FD for flock once
exec 200>>"$LOCK_FILE"

ensure_owner() {
  local path="$1"
  if [ -z "$path" ]; then
    return
  fi
  if [ -n "$PUID" ] && [ -n "$PGID" ]; then
    chown "$PUID":"$PGID" "$path" 2>/dev/null || true
  fi
}

rotate_if_needed() {
  # Ensure file exists
  if [ ! -f "$LOG_FILE_PATH" ]; then
    touch "$LOG_FILE_PATH"
    ensure_owner "$LOG_FILE_PATH"
    return
  fi

  current_size=$(stat -c%s "$LOG_FILE_PATH" 2>/dev/null || echo 0)
  if [ "$MAX_BYTES" -gt 0 ] && [ "$current_size" -ge "$MAX_BYTES" ]; then
    stamp=$(date +"%Y%m%d-%H%M%S")
    rotated="${LOG_FILE_PATH}.${stamp}"
    mv "$LOG_FILE_PATH" "$rotated"
    touch "$LOG_FILE_PATH"
    ensure_owner "$LOG_FILE_PATH"
    ensure_owner "$rotated"
  fi

  if [ "$RETENTION_DAYS" -gt 0 ]; then
    find "$DIRNAME" -maxdepth 1 -type f -name "${BASENAME}.*" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
  fi
}

write_line() {
  local line="$1"
  local ts
  ts=$(date +"%Y-%m-%dT%H:%M:%S%z")
  flock 200
  rotate_if_needed
  ensure_owner "$LOG_FILE_PATH"
  printf '%s [%s] [%s] %s\n' "$ts" "${SERVICE^^}" "${LEVEL_NORM^^}" "$line" >> "$LOG_FILE_PATH"
  flock -u 200
}

echo_line() {
  if [ "$LOG_ECHO" = "0" ]; then
    return
  fi
  case "$STREAM" in
    stderr)
      printf '%s\n' "$1" >&2
      ;;
    *)
      printf '%s\n' "$1"
      ;;
  esac
}

should_log() {
  [ "$THRESHOLD" -ge "$MESSAGE_LEVEL" ]
}

while IFS= read -r line || [ -n "$line" ]; do
  echo_line "$line"
  if should_log; then
    write_line "$line"
  fi
done

exit 0
