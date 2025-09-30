#!/usr/bin/env sh
set -eu

# Expected env:
#   BACKUP_SOURCE             (e.g. /data)
#   BACKUP_TAG                (e.g. whiskey-db)
#   BACKUP_ENCRYPTED          (true|false)
#   RESTIC_REPOSITORY         (encrypted mode)
#   RESTIC_PASSWORD           (encrypted mode)
#   RESTIC_KEEP_DAILY/WEEKLY/MONTHLY (encrypted mode retention)
#   BACKUP_ARCHIVE_DIR        (plaintext mode destination)
#   PLAINTEXT_RETENTION_DAYS  (plaintext mode retention window)

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[backup] $1"; }

: "${BACKUP_ENCRYPTED:=true}"
BACKUP_ENCRYPTED=$(printf %s "$BACKUP_ENCRYPTED" | tr '[:upper:]' '[:lower:]')
case "$BACKUP_ENCRYPTED" in
  true|false) ;;
  *)
    log "ERROR: BACKUP_ENCRYPTED must be 'true' or 'false' (got '$BACKUP_ENCRYPTED')."
    exit 1
    ;;
 esac

if [ "$BACKUP_ENCRYPTED" = "true" ]; then
  log "Starting backup at $(ts)"
  log "Source: ${BACKUP_SOURCE}  Repo: ${RESTIC_REPOSITORY}"

  restic backup "${BACKUP_SOURCE}" \
    --tag "${BACKUP_TAG}" \
    --exclude-caches

  status=$?
  if [ $status -ne 0 ]; then
    log "ERROR: restic backup exited with status ${status} at $(ts)"
    exit $status
  fi
  log "Backup completed successfully at $(ts)"

  log "Pruning (daily=${RESTIC_KEEP_DAILY} weekly=${RESTIC_KEEP_WEEKLY} monthly=${RESTIC_KEEP_MONTHLY})"
  restic forget --prune \
    --keep-daily "${RESTIC_KEEP_DAILY}" \
    --keep-weekly "${RESTIC_KEEP_WEEKLY}" \
    --keep-monthly "${RESTIC_KEEP_MONTHLY}"

  status=$?
  if [ $status -ne 0 ]; then
    log "ERROR: restic forget/prune exited with status ${status} at $(ts)"
    exit $status
  fi
  log "Prune completed at $(ts)"

  # (Optional) Quick integrity check; uncomment if desired
  # log "Running restic check…"
  # restic check --read-data-subset=1%
  # log "Restic check finished at $(ts)"
else
  : "${BACKUP_ARCHIVE_DIR:?BACKUP_ARCHIVE_DIR is required when BACKUP_ENCRYPTED=false}"
  : "${PLAINTEXT_RETENTION_DAYS:=30}"

  timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
  tag=${BACKUP_TAG:-backup}
  archive_dir=${BACKUP_ARCHIVE_DIR%/}
  [ -n "$archive_dir" ] || archive_dir="/"
  archive_path="${archive_dir}/${tag}-${timestamp}.tar.gz"

  log "Starting plaintext backup at $(ts)"
  log "Source: ${BACKUP_SOURCE}  Archive: ${archive_path}"

  mkdir -p "$archive_dir"
  if ! tar -C "$BACKUP_SOURCE" -czf "$archive_path" .; then
    log "ERROR: tar failed while creating ${archive_path} at $(ts)"
    rm -f "$archive_path" 2>/dev/null || true
    exit 1
  fi

  log "Plaintext archive created"

  if printf %s "$PLAINTEXT_RETENTION_DAYS" | grep -Eq '^[0-9]+$'; then
    find "$archive_dir" -maxdepth 1 -type f \
      -name "${tag}-*.tar.gz" -mtime "+${PLAINTEXT_RETENTION_DAYS}" \
      -print | while IFS= read -r expired; do
        [ -n "$expired" ] || continue
        log "Removing expired archive ${expired}"
        rm -f "$expired" 2>/dev/null || log "WARN: failed to remove ${expired}"
      done
  else
    log "PLAINTEXT_RETENTION_DAYS='${PLAINTEXT_RETENTION_DAYS}' is not numeric; skipping cleanup"
  fi

  log "Plaintext backup finished at $(ts)"
fi

log "backup.sh finished at $(ts)"
