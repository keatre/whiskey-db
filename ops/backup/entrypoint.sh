#!/usr/bin/env sh
set -eu

# Install tools inside the lightweight Alpine backup container
apk add --no-cache restic tzdata ca-certificates

: "${BACKUP_ENABLED:=true}"
: "${BACKUP_CRON:=0 3 * * *}"                # 3:00 AM daily
: "${BACKUP_SOURCE:=/data}"                  # where whiskey.db lives
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"  # e.g. /remote/whiskey-db (NAS mount)

: "${RESTIC_KEEP_DAILY:=7}"
: "${RESTIC_KEEP_WEEKLY:=4}"
: "${RESTIC_KEEP_MONTHLY:=12}"
: "${BACKUP_TAG:=whiskey-db}"

LOG_DIR=/var/log
LOG_FILE="$LOG_DIR/backup.log"
mkdir -p "$LOG_DIR"

if [ "$BACKUP_ENABLED" != "true" ]; then
  echo "[backup] BACKUP_ENABLED=false → container idle." | tee -a "$LOG_FILE"
  tail -f /dev/null
  exit 0
fi

# Export for cron
export BACKUP_SOURCE BACKUP_TAG RESTIC_REPOSITORY RESTIC_PASSWORD \
       RESTIC_KEEP_DAILY RESTIC_KEEP_WEEKLY RESTIC_KEEP_MONTHLY

# Initialize repo if needed (works for local/NAS paths too)
if ! restic snapshots >/dev/null 2>&1; then
  echo "[backup] Initializing restic repository at ${RESTIC_REPOSITORY}..."
  restic init
fi

# Write crontab
echo "${BACKUP_CRON} /app/backup.sh >> ${LOG_FILE} 2>&1" > /etc/crontabs/root
echo "[backup] Cron installed: ${BACKUP_CRON} /app/backup.sh"

# First-run backup (useful smoke test)
echo "[backup] Running first backup now..."
/app/backup.sh >> "${LOG_FILE}" 2>&1 || true

# Start cron and tail logs
crond -f -l 8 &
tail -F "${LOG_FILE}"
