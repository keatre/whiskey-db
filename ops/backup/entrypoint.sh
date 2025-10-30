#!/usr/bin/env sh
set -eu

# --- Config with sane defaults ---
: "${BACKUP_ENCRYPTED:=true}"
BACKUP_ENCRYPTED=$(printf %s "$BACKUP_ENCRYPTED" | tr '[:upper:]' '[:lower:]')
case "$BACKUP_ENCRYPTED" in
  true|false) ;;
  *)
    echo "[backup] ERROR: BACKUP_ENCRYPTED must be 'true' or 'false' (got '$BACKUP_ENCRYPTED')."
    exit 1
    ;;
esac

: "${BACKUP_LOCAL_FILES:=false}"
BACKUP_LOCAL_FILES=$(printf %s "$BACKUP_LOCAL_FILES" | tr '[:upper:]' '[:lower:]')
case "$BACKUP_LOCAL_FILES" in
  true|false) ;;
  *)
    echo "[backup] ERROR: BACKUP_LOCAL_FILES must be 'true' or 'false' (got '$BACKUP_LOCAL_FILES')."
    exit 1
    ;;
esac

: "${BACKUP_ENABLED:=true}"
: "${BACKUP_CRON:=0 3 * * *}"                # 3:00 AM daily
: "${BACKUP_SOURCE:=/data}"                  # where whiskey.db lives

: "${BACKUP_REPOSITORY:=}"              # canonical path for both encrypted + plaintext modes
# Backward compatibility with legacy RESTIC_REPOSITORY env var
if [ -z "$BACKUP_REPOSITORY" ] && [ -n "${RESTIC_REPOSITORY:-}" ]; then
  BACKUP_REPOSITORY="$RESTIC_REPOSITORY"
fi
: "${BACKUP_REPOSITORY:=}"
: "${BACKUP_ARCHIVE_DIR:=}"             # optional override target for plaintext mode
: "${PLAINTEXT_RETENTION_DAYS:=30}"

if [ "$BACKUP_ENCRYPTED" = "true" ]; then
  : "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required when BACKUP_ENCRYPTED=true}"
  : "${BACKUP_REPOSITORY:?BACKUP_REPOSITORY is required when BACKUP_ENCRYPTED=true}"  # e.g. /remote/restic-whiskey-db (NAS bind mount)
else
  : "${BACKUP_ARCHIVE_DIR:=${BACKUP_REPOSITORY:-}}"
  if [ -z "$BACKUP_ARCHIVE_DIR" ]; then
    echo "[backup] ERROR: Set BACKUP_ARCHIVE_DIR (or BACKUP_REPOSITORY) when BACKUP_ENCRYPTED=false."
    exit 1
  fi
  mkdir -p "$BACKUP_ARCHIVE_DIR"
fi

: "${RESTIC_KEEP_DAILY:=7}"
: "${RESTIC_KEEP_WEEKLY:=4}"
: "${RESTIC_KEEP_MONTHLY:=12}"
: "${BACKUP_TAG:=whiskey-db}"
: "${BACKUP_TIMEOUT:=600}"                    # first backup timeout (seconds)
: "${BACKUP_ON_START:=false}"                # run an immediate backup on start

LOG_DIR=/var/log
LOG_FILE="$LOG_DIR/backup.log"
mkdir -p "$LOG_DIR"
# Ensure log file exists before tailing
touch "$LOG_FILE"

# PIDs for managed children
CROND_PID=""
TAIL_PID=""
BACKUP_PID=""

# Ensure restic exists (installed in image)
if [ "$BACKUP_ENCRYPTED" = "true" ] && ! command -v restic >/dev/null 2>&1; then
  echo "[backup] ERROR: restic not found in image."
  exit 1
fi

# Ensure scripts are executable
chmod +x /app/*.sh 2>/dev/null || true

if [ "$BACKUP_ENABLED" != "true" ]; then
  echo "[backup] BACKUP_ENABLED=false → container idle." | tee -a "$LOG_FILE"
  # Keep container alive without tying up CPU
  # and still allow clean stop.
  tail -f /dev/null &
  TAIL_PID=$!
  trap 'kill $TAIL_PID 2>/dev/null || true; exit 0' INT TERM
  wait $TAIL_PID
  exit 0
fi

# Keep restic-cli env in sync with canonical name
RESTIC_REPOSITORY="$BACKUP_REPOSITORY"

# Export for cron (busybox crond has minimal env)
export BACKUP_SOURCE BACKUP_TAG BACKUP_ENCRYPTED BACKUP_REPOSITORY RESTIC_REPOSITORY BACKUP_ARCHIVE_DIR \
       RESTIC_PASSWORD RESTIC_KEEP_DAILY RESTIC_KEEP_WEEKLY RESTIC_KEEP_MONTHLY \
       PLAINTEXT_RETENTION_DAYS BACKUP_LOCAL_FILES

# Initialize repo if needed
if [ "$BACKUP_ENCRYPTED" = "true" ]; then
  echo "[backup] BACKUP_ENCRYPTED=true → using restic repository at ${BACKUP_REPOSITORY}."
  if ! restic snapshots >/dev/null 2>&1; then
    echo "[backup] Initializing restic repository at ${BACKUP_REPOSITORY}..."
    restic init
  fi
else
  echo "[backup] BACKUP_ENCRYPTED=false → using plaintext tar archives in ${BACKUP_ARCHIVE_DIR}."
fi

if [ "$BACKUP_LOCAL_FILES" = "true" ]; then
  echo "[backup] BACKUP_LOCAL_FILES=true → will include /config/docker-compose.yml and /config/.env when present."
fi

# Install crontab: run backup.sh via /bin/sh; log to file with timestamps
# (busybox crond uses /etc/crontabs/root)
echo "${BACKUP_CRON} /bin/sh /app/backup.sh >> ${LOG_FILE} 2>&1" > /etc/crontabs/root
echo "[backup] Cron installed: ${BACKUP_CRON} /app/backup.sh"

# --- Signal-aware cleanup (PID 1) ---
cleanup() {
  echo "[backup] Received stop signal, shutting down..."
  # Try to unlock restic (no-op if no lock)
  if [ "$BACKUP_ENCRYPTED" = "true" ]; then
    restic unlock >/dev/null 2>&1 || true
  fi
  # Stop in-flight first backup if running
  if [ -n "${BACKUP_PID}" ] 2>/dev/null; then
    kill "${BACKUP_PID}" 2>/dev/null || true
  fi
  # Stop children
  kill "$CROND_PID" 2>/dev/null || true
  kill "$TAIL_PID"  2>/dev/null || true
  # As a safety net, terminate any remaining children of this script
  pkill -TERM -P $$ 2>/dev/null || true
  sleep 1
  pkill -KILL -P $$ 2>/dev/null || true
  # Reap
  wait "$CROND_PID" 2>/dev/null || true
  wait "$TAIL_PID"  2>/dev/null || true
  echo "[backup] Exit complete."
  exit 0
}
trap cleanup INT TERM

# --- First backup now (smoke test) ---
if [ "${BACKUP_ON_START}" = "true" ]; then
  echo "[backup] Running first backup now..."
  # Run in background so trap can terminate it if needed
  timeout "${BACKUP_TIMEOUT}" /bin/sh /app/backup.sh >> "${LOG_FILE}" 2>&1 &
  BACKUP_PID=$!
  wait "${BACKUP_PID}" 2>/dev/null || true
  BACKUP_PID=""
  echo "[backup] First backup finished at $(date +"%Y-%m-%dT%H:%M:%S%z")"
else
  echo "[backup] BACKUP_ON_START=false → skipping initial backup."
fi

# --- Start cron (foreground) and tail logs ---
crond -f -l 8 &
CROND_PID=$!
echo "[backup] crond started (pid=${CROND_PID})"

# Keep container alive by following logs
# Tail in background so PID 1 remains this script (to catch signals)
tail -F "${LOG_FILE}" &
TAIL_PID=$!

# Wait on children; PID 1 handles signals and cleans up
wait
