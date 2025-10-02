#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: with-logging.sh <service> [--] <command>..." >&2
  exit 2
fi

SERVICE=$1
shift

if [ "$#" -eq 0 ]; then
  echo "with-logging.sh: missing command" >&2
  exit 2
fi

CMD=()
if [ "${1:-}" = "--" ]; then
  shift
  CMD=("$@")
else
  CMD=("bash" "-lc" "$*")
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LOGGING_ROOT=${LOGGING_DIR:-/logging}
if [ ! -x "$LOGGING_ROOT/log_writer.sh" ]; then
  LOGGING_ROOT="$SCRIPT_DIR"
fi
LOG_WRITER="$LOGGING_ROOT/log_writer.sh"

LOG_LEVEL_NORMALIZED=$(printf '%s' "${LOG_LEVEL:-info}" | tr '[:upper:]' '[:lower:]')

# Map service-specific log verbosity if needed
case "$SERVICE" in
  api)
    case "$LOG_LEVEL_NORMALIZED" in
      none) API_LOG_LEVEL=info ;;
      error) API_LOG_LEVEL=error ;;
      warn|warning) API_LOG_LEVEL=warning ;;
      debug) API_LOG_LEVEL=debug ;;
      trace) API_LOG_LEVEL=trace ;;
      *) API_LOG_LEVEL=info ;;
    esac
    export API_LOG_LEVEL
    ;;
  web)
    export WEB_LOG_LEVEL="$LOG_LEVEL_NORMALIZED"
    ;;
  backup)
    export BACKUP_LOG_LEVEL="$LOG_LEVEL_NORMALIZED"
    ;;
esac

if [ "$LOG_LEVEL_NORMALIZED" = "none" ]; then
  exec "${CMD[@]}"
fi

# Ensure stdbuf for line buffering if available
if command -v stdbuf >/dev/null 2>&1; then
  CMD=("stdbuf" "-oL" "-eL" "${CMD[@]}")
fi

# Run command with logging capture
set +e
set -o pipefail
"${CMD[@]}" \
  > >(LOG_STREAM=stdout LOG_LEVEL="$LOG_LEVEL_NORMALIZED" "$LOG_WRITER" "$SERVICE" info) \
  2> >(LOG_STREAM=stderr LOG_LEVEL="$LOG_LEVEL_NORMALIZED" "$LOG_WRITER" "$SERVICE" error)
STATUS=$?
set +o pipefail

wait || true

exit $STATUS
