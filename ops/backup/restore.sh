#!/usr/bin/env bash
set -euo pipefail

# Restore the latest snapshot into ./data
# Usage:
#   export BACKUP_REPOSITORY=/path/or/mounted/NAS/folder
#   export RESTIC_PASSWORD=...
#   ./ops/backup/restore.sh

TARGET_DIR="./data"

if [ -z "${RESTIC_REPOSITORY:-}" ] && [ -n "${BACKUP_REPOSITORY:-}" ]; then
  RESTIC_REPOSITORY="$BACKUP_REPOSITORY"
fi

if [ -z "${RESTIC_REPOSITORY:-}" ] || [ -z "${RESTIC_PASSWORD:-}" ]; then
  echo "Set BACKUP_REPOSITORY (or RESTIC_REPOSITORY) and RESTIC_PASSWORD in your environment first."
  exit 1
fi

echo "[restore] Restoring latest snapshot to ${TARGET_DIR} ..."
mkdir -p "${TARGET_DIR}"
docker run --rm \
  -e BACKUP_REPOSITORY="${BACKUP_REPOSITORY:-}" \
  -e RESTIC_REPOSITORY \
  -e RESTIC_PASSWORD \
  -v "$(pwd)/data:/restore" \
  -v "$(pwd)/ops/backup:/app" \
  -v "$(pwd)/.env:/envfile.env:ro" \
  -v "$(pwd):/work" \
  -v "$(pwd)/nas_mount:/remote" \
  restic/restic:latest \
  restore latest --target /restore

echo "[restore] Done. Restart your stack to use the restored DB."
