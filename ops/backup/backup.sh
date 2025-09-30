#!/usr/bin/env sh
set -eu

# Expected env:
#   BACKUP_SOURCE             (e.g. /data)
#   BACKUP_TAG                (e.g. whiskey-db)
#   BACKUP_ENCRYPTED          (true|false)
#   BACKUP_LOCAL_FILES        (true|false) include docker-compose.yml/.env when available
#   RESTIC_REPOSITORY         (encrypted mode)
#   RESTIC_PASSWORD           (encrypted mode)
#   RESTIC_KEEP_DAILY/WEEKLY/MONTHLY (encrypted mode retention)
#   BACKUP_ARCHIVE_DIR        (plaintext mode destination)
#   PLAINTEXT_RETENTION_DAYS  (plaintext mode retention window)

ts() { date +"%Y-%m-%dT%H:%M:%S%z"; }
log() { echo "[backup] $1"; }

clean_path() {
  raw=$(printf '%s' "$1" | sed 's/[[:space:]]*#.*$//')
  raw=$(printf '%s' "$raw" | tr -d '\r')
  raw=$(printf '%s' "$raw" | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')
  if [ -z "$raw" ]; then
    printf '%s' "$raw"
    return
  fi
  case "$raw" in
    /*) prefix='/' ;;
    *) prefix='' ;;
  esac
  cleaned=$(printf '%s' "$raw" | sed 's:/\{1,\}:/:g')
  if [ "$cleaned" != '/' ]; then
    cleaned=${cleaned%/}
  fi
  if [ "$prefix" = '/' ] && [ "${cleaned#/}" = "$cleaned" ]; then
    cleaned="/$cleaned"
  fi
  [ -z "$cleaned" ] && cleaned='/'
  printf '%s' "$cleaned"
}

: "${BACKUP_ENCRYPTED:=true}"
BACKUP_ENCRYPTED=$(printf %s "$BACKUP_ENCRYPTED" | tr '[:upper:]' '[:lower:]')
case "$BACKUP_ENCRYPTED" in
  true|false) ;;
  *)
    log "ERROR: BACKUP_ENCRYPTED must be 'true' or 'false' (got '$BACKUP_ENCRYPTED')."
    exit 1
    ;;
 esac

: "${BACKUP_LOCAL_FILES:=false}"
BACKUP_LOCAL_FILES=$(printf %s "$BACKUP_LOCAL_FILES" | tr '[:upper:]' '[:lower:]')
case "$BACKUP_LOCAL_FILES" in
  true|false) ;;
  *)
    log "ERROR: BACKUP_LOCAL_FILES must be 'true' or 'false' (got '$BACKUP_LOCAL_FILES')."
    exit 1
    ;;
esac

BACKUP_SOURCE_ORIGINAL="$BACKUP_SOURCE"
BACKUP_SOURCE=$(clean_path "$BACKUP_SOURCE")
log "[backup] DEBUG: BACKUP_SOURCE original='${BACKUP_SOURCE_ORIGINAL}' resolved='${BACKUP_SOURCE}'"
if [ -z "$BACKUP_SOURCE" ]; then
  log "ERROR: BACKUP_SOURCE resolved to empty path."
  exit 1
fi
if [ ! -d "$BACKUP_SOURCE" ]; then
  log "ERROR: BACKUP_SOURCE '${BACKUP_SOURCE_ORIGINAL}' resolved to '${BACKUP_SOURCE}', which is not a directory."
  exit 1
fi

EXTRA_SOURCES=""
EXTRA_LABEL=""
if [ "$BACKUP_LOCAL_FILES" = "true" ]; then
  for path in /config/docker-compose.yml /config/.env; do
    if [ -f "$path" ]; then
      EXTRA_SOURCES="$EXTRA_SOURCES $path"
      base=$(basename "$path")
      if [ -n "$EXTRA_LABEL" ]; then
        EXTRA_LABEL="$EXTRA_LABEL, $base"
      else
        EXTRA_LABEL="$base"
      fi
    else
      log "WARN: BACKUP_LOCAL_FILES enabled but missing ${path}; skipping."
    fi
  done
fi

if [ "$BACKUP_ENCRYPTED" = "true" ]; then
  log "Starting backup at $(ts)"
  if [ -n "$EXTRA_LABEL" ]; then
    log "Source: ${BACKUP_SOURCE} (+${EXTRA_LABEL})  Repo: ${RESTIC_REPOSITORY}"
  else
    log "Source: ${BACKUP_SOURCE}  Repo: ${RESTIC_REPOSITORY}"
  fi

  set -- restic backup --tag "${BACKUP_TAG}" --exclude-caches
  set -- "$@" "${BACKUP_SOURCE}"
  if [ -n "$EXTRA_SOURCES" ]; then
    for path in $EXTRA_SOURCES; do
      set -- "$@" "$path"
    done
  fi

  "$@"

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

  timestamp=$(date +"%Y%m%dT%H%M%S")
  tag=${BACKUP_TAG:-backup}
  archive_dir=${BACKUP_ARCHIVE_DIR%/}
  [ -n "$archive_dir" ] || archive_dir="/"
  archive_path="${archive_dir}/${tag}-${timestamp}.tar.gz"

  log "Starting plaintext backup at $(ts)"
  if [ -n "$EXTRA_LABEL" ]; then
    log "Source: ${BACKUP_SOURCE} (+${EXTRA_LABEL})  Archive: ${archive_path}"
  else
    log "Source: ${BACKUP_SOURCE}  Archive: ${archive_path}"
  fi

  mkdir -p "$archive_dir"

  if [ "$BACKUP_SOURCE" = "/" ]; then
    data_entry="."
  else
    data_entry=${BACKUP_SOURCE#/}
    [ -z "$data_entry" ] && data_entry="$BACKUP_SOURCE"
  fi

  tmp_archive="/tmp/${tag}-${timestamp}.tar.gz"
  set -- tar -czf "$tmp_archive" -C /
  set -- "$@" "$data_entry"

  if [ -n "$EXTRA_SOURCES" ]; then
    for path in $EXTRA_SOURCES; do
      rel=${path#/}
      [ -n "$rel" ] && set -- "$@" "$rel"
    done
  fi

  if ! "$@"; then
    log "ERROR: tar failed while creating temp archive ${tmp_archive} at $(ts)"
    rm -f "$tmp_archive" 2>/dev/null || true
    exit 1
  fi

  if ! gzip -t "$tmp_archive" >/dev/null 2>&1; then
    log "ERROR: gzip verification failed for ${tmp_archive}"
    rm -f "$tmp_archive" 2>/dev/null || true
    exit 1
  fi

  if ! cp "$tmp_archive" "$archive_path"; then
    log "ERROR: failed to copy ${tmp_archive} to ${archive_path}"
    rm -f "$tmp_archive" 2>/dev/null || true
    exit 1
  fi

  rm -f "$tmp_archive" 2>/dev/null || true
  sync "$archive_dir" >/dev/null 2>&1 || sync >/dev/null 2>&1 || true

  if ! gzip -t "$archive_path" >/dev/null 2>&1; then
    log "ERROR: gzip verification failed for ${archive_path} after copy"
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
