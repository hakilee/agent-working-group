#!/usr/bin/env bash
set -euo pipefail

# Category: dashboard-operation
# Role: Check AWG dashboard health for local supervisor probes.

DASHBOARD_URL=${DASHBOARD_URL:-http://127.0.0.1:${DASHBOARD_PORT:-8000}/api/status}
TIMEOUT=${TIMEOUT:-5}

usage() {
  cat <<'USAGE'
Usage: awg-dashboard-healthcheck.sh [--url URL] [--timeout SECONDS]

Checks the AWG dashboard status endpoint and exits non-zero if the dashboard is
unreachable, returns a non-2xx response, or reports an unsafe temporary root.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) DASHBOARD_URL=${2:?}; shift 2 ;;
    --timeout) TIMEOUT=${2:?}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

payload=$(curl -fsS --max-time "$TIMEOUT" "$DASHBOARD_URL")
DASHBOARD_PAYLOAD="$payload" python3 - <<'PY'
import json
import os

data = json.loads(os.environ["DASHBOARD_PAYLOAD"])
if data.get("isTmpRoot"):
    raise SystemExit("dashboard is using a temporary AWG root")
queue_path = data.get("queuePath")
if not data.get("queuePathExists"):
    raise SystemExit(f"dashboard queue path is missing: {queue_path}")
print("ok")
PY
