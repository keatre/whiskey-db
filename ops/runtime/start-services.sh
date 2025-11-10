#!/usr/bin/env bash
set -euo pipefail

LOG_WRAPPER=${LOG_WRAPPER:-/logging/with-logging.sh}
WEB_DIR=${WEB_DIR:-/srv/web}
API_DIR=${API_DIR:-/srv/api}
BACKUP_ENTRYPOINT=${BACKUP_ENTRYPOINT:-/srv/backup/entrypoint.sh}
WEB_PORT=${WEB_PORT:-3000}
API_HOST=${API_HOST:-0.0.0.0}
API_PORT=${API_PORT:-8000}
API_LOG_LEVEL=${API_LOG_LEVEL:-info}

if [ ! -x "$LOG_WRAPPER" ]; then
  echo "[entrypoint] log wrapper missing at $LOG_WRAPPER" >&2
  exit 1
fi

if [ ! -d "$WEB_DIR" ]; then
  echo "[entrypoint] web directory missing at $WEB_DIR" >&2
  exit 1
fi

if [ ! -d "$API_DIR" ]; then
  echo "[entrypoint] api directory missing at $API_DIR" >&2
  exit 1
fi

if [ ! -x "$BACKUP_ENTRYPOINT" ]; then
  echo "[entrypoint] backup entrypoint missing at $BACKUP_ENTRYPOINT" >&2
  exit 1
fi

mkdir -p /logs /data

declare -a CHILD_PIDS=()

start_api() {
  (
    cd "$API_DIR"
    exec "$LOG_WRAPPER" api -- \
      uvicorn app.main:app \
        --host "$API_HOST" \
        --port "$API_PORT" \
        --log-level "$API_LOG_LEVEL"
  ) &
  CHILD_PIDS+=("$!")
}

start_web() {
  (
    cd "$WEB_DIR"
    export NODE_ENV=production
    export NEXT_TELEMETRY_DISABLED=1
    export PORT="$WEB_PORT"
    exec "$LOG_WRAPPER" web -- npm run start
  ) &
  CHILD_PIDS+=("$!")
}

start_backup() {
  (
    cd "$(dirname "$BACKUP_ENTRYPOINT")"
    exec "$LOG_WRAPPER" backup -- /bin/sh "$BACKUP_ENTRYPOINT"
  ) &
  CHILD_PIDS+=("$!")
}

stop_children() {
  for pid in "${CHILD_PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}

handle_signal() {
  stop_children
  wait || true
  exit 0
}

trap 'handle_signal' INT TERM

start_api
start_web
start_backup

wait_status=0
if ! wait -n; then
  wait_status=$?
fi

stop_children
wait || true
exit "$wait_status"
