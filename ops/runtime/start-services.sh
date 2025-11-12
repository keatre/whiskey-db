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
DEFAULT_LOOPBACK_API=${DEFAULT_LOOPBACK_API:-http://127.0.0.1:8000}
LEGACY_API_HOST=${LEGACY_API_HOST:-api}

normalize_loopback() {
  local value="$1"
  local var_name="$2"
  local lowered="${value,,}"
  case "$lowered" in
    ""|http://api|http://api/*|http://api:8000|http://api:8000/*)
      echo "[entrypoint] ${var_name:-API_BASE}: fell back to ${DEFAULT_LOOPBACK_API} for single-container routing."
      printf '%s' "$DEFAULT_LOOPBACK_API"
      return
      ;;
  esac
  printf '%s' "$value"
}

API_BASE=$(normalize_loopback "${API_BASE:-}" "API_BASE")
NEXT_BACKEND_ORIGIN=$(normalize_loopback "${NEXT_BACKEND_ORIGIN:-}" "NEXT_BACKEND_ORIGIN")
export API_BASE
export NEXT_BACKEND_ORIGIN

ensure_host_alias() {
  local ip="$1"
  local host="$2"
  if grep -Eq "^[[:space:]]*${ip//./\\.}[[:space:]]+${host}([[:space:]]|\$)" /etc/hosts; then
    return
  fi
  echo "[entrypoint] Adding legacy host alias ${host} -> ${ip}."
  printf '%s %s\n' "$ip" "$host" >> /etc/hosts
}

ensure_host_alias "127.0.0.1" "$LEGACY_API_HOST"

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

ensure_mount_dir() {
  local path="$1"
  mkdir -p "$path"
  if [ -n "${PUID:-}" ] && [ -n "${PGID:-}" ]; then
    # chown may fail when mounts are read-only; ignore in that case
    chown "${PUID}:${PGID}" "$path" 2>/dev/null || true
  fi
}

ensure_mount_dir /logs
ensure_mount_dir /data

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
