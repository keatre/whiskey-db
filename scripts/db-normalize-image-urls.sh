#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run the normalization script inside the API container.
# Usage:
#   ./scripts/db-normalize-image-urls.sh           # dry-run
#   RUN=1 ./scripts/db-normalize-image-urls.sh     # commit changes
#
# Optional overrides:
#   DB_PATH=/data/whiskey.db NEXT_PUBLIC_API_BASE=/api ./scripts/db-normalize-image-urls.sh

API_SVC=${API_SVC:-api}
DB_PATH=${DB_PATH:-/data/whiskey.db}
NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE:-/api}
RUN_FLAG=${RUN:-}

echo "[runner] API_SVC=${API_SVC} DB_PATH=${DB_PATH} NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE} RUN=${RUN_FLAG:-0}"

# Ensure the script exists in the container path (/app is the mounted ./api)
docker compose exec -T "${API_SVC}" sh -lc "test -f /app/scripts/normalize_image_urls.py || { echo 'Missing /app/scripts/normalize_image_urls.py'; exit 1; }"

# Pass env into container and run
docker compose exec -T -e DB_PATH="${DB_PATH}" -e NEXT_PUBLIC_API_BASE="${NEXT_PUBLIC_API_BASE}" -e RUN="${RUN_FLAG:-}" "${API_SVC}" \
  sh -lc "python /app/scripts/normalize_image_urls.py"
