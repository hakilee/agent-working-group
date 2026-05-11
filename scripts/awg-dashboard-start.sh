#!/usr/bin/env bash
set -euo pipefail

# Category: dashboard-operation
# Role: Start the AWG dashboard (FastAPI + static SPA) under uvicorn.
#
# awg-dashboard-start.sh — Launch the AWG dashboard server.
#
# Reads configuration from environment variables (or a sibling .env file if
# present) and execs uvicorn with the resolved settings. Writes a PID file so
# the server can be stopped with `kill $(cat $DASHBOARD_PID_FILE)`.
#
# Environment:
#   DASHBOARD_HOST            bind address (default 127.0.0.1)
#   DASHBOARD_PORT            bind port    (default 8000)
#   DASHBOARD_ROOT            AWG root directory (default $AWG_ROOT or
#                             ./.agent-working-group)
#   DASHBOARD_ALLOWED_ORIGINS comma-separated CORS allowlist
#   DASHBOARD_LOG_LEVEL       uvicorn log level (default info)
#   DASHBOARD_PID_FILE        path to PID file (default $DASHBOARD_ROOT/dashboard.pid)
#   DASHBOARD_ENV_FILE        path to .env file to source (default
#                             $REPO_ROOT/dashboard/.env if it exists)
#
# Exit codes:
#   0   — uvicorn exited cleanly
#   1+  — startup failure (missing python, missing uvicorn, etc.)

repo_root=$(cd "$(dirname "$0")/.." && pwd)
server_dir="${repo_root}/dashboard/server"

env_file=${DASHBOARD_ENV_FILE:-"${repo_root}/dashboard/.env"}
if [ -f "$env_file" ]; then
  # shellcheck disable=SC1090
  set -a
  . "$env_file"
  set +a
fi

DASHBOARD_HOST=${DASHBOARD_HOST:-127.0.0.1}
DASHBOARD_PORT=${DASHBOARD_PORT:-8000}
DASHBOARD_ROOT=${DASHBOARD_ROOT:-${AWG_ROOT:-"${repo_root}/.agent-working-group"}}
DASHBOARD_LOG_LEVEL=${DASHBOARD_LOG_LEVEL:-info}
DASHBOARD_PID_FILE=${DASHBOARD_PID_FILE:-"${DASHBOARD_ROOT}/dashboard.pid"}

export DASHBOARD_HOST DASHBOARD_PORT DASHBOARD_ROOT DASHBOARD_LOG_LEVEL
[ -n "${DASHBOARD_ALLOWED_ORIGINS:-}" ] && export DASHBOARD_ALLOWED_ORIGINS

# Make `agent_working_group` (in src/) importable from the FastAPI app, so
# routers/liveness.py can use TimeoutChecker without installing the package.
if [ -z "${PYTHONPATH:-}" ]; then
  export PYTHONPATH="${repo_root}/src"
else
  export PYTHONPATH="${repo_root}/src:${PYTHONPATH}"
fi

python_bin=${PYTHON:-python3}
if ! command -v "$python_bin" >/dev/null 2>&1; then
  echo "awg-dashboard-start: python interpreter '$python_bin' not found" >&2
  exit 1
fi

if ! "$python_bin" -c 'import uvicorn' >/dev/null 2>&1; then
  echo "awg-dashboard-start: uvicorn not installed for $python_bin" >&2
  echo "  install with: $python_bin -m pip install -r ${server_dir}/requirements.txt" >&2
  exit 1
fi

mkdir -p "$(dirname "$DASHBOARD_PID_FILE")"

echo "awg-dashboard: host=$DASHBOARD_HOST port=$DASHBOARD_PORT root=$DASHBOARD_ROOT log=$DASHBOARD_LOG_LEVEL" >&2

cd "$server_dir"

# Write the PID before exec so callers can stop the server with the PID file.
# Using $$ lets the same shell instance be tracked across the exec.
echo $$ > "$DASHBOARD_PID_FILE"

exec "$python_bin" -m uvicorn main:app \
  --host "$DASHBOARD_HOST" \
  --port "$DASHBOARD_PORT" \
  --log-level "$DASHBOARD_LOG_LEVEL" \
  --no-access-log
