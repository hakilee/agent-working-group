#!/usr/bin/env bash
set -euo pipefail

# Category: hook
# Role: Hook adapter that runs a read-only worker heartbeat staleness check.
#
# awg-hook-worker-heartbeat.sh — Read-only worker heartbeat check.
#
# Heartbeat contract:
#   - Workers MUST periodically refresh a file at:
#       $AWG_ROOT/heartbeats/{agent}/{session}.ts
#   - The file content is a single line: a Unix epoch seconds integer.
#   - The file's existence is the worker's liveness signal; the timestamp
#     is the freshness signal.
#   - This script is observer-only: it never writes, deletes, or moves
#     anything in the queue or in $AWG_ROOT/heartbeats.
#
# Behavior:
#   - Resolves the agent from $AWG_MESSAGE_TO (set by the hook dispatcher)
#     or from $WORKER (operator-provided fallback).
#   - Resolves the session from $AWG_WORKER_SESSION; if unset, scans all
#     session files for the agent and uses the freshest.
#   - If no heartbeat file exists, emits a CRITICAL alert and exits 0
#     (hooks are advisory by default; non-zero is reserved for hook
#     configuration errors). Set HEARTBEAT_FAIL_ON_MISSING=1 to exit 1.
#   - If the freshest heartbeat is older than WORKER_HEARTBEAT_TIMEOUT
#     seconds (default 300), emits a WARNING.
#   - Otherwise emits an OK line.
#
# Usage from hooks.json:
#   {
#     "name": "worker-heartbeat",
#     "event": "on_processing",
#     "command": ["scripts/awg-hook-worker-heartbeat.sh"],
#     "filters": {"to": "worker"},
#     "timeoutSeconds": 5
#   }

AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
WORKER=${AWG_MESSAGE_TO:-${WORKER:-worker}}
WORKER_HEARTBEAT_TIMEOUT=${WORKER_HEARTBEAT_TIMEOUT:-300}
HEARTBEAT_FAIL_ON_MISSING=${HEARTBEAT_FAIL_ON_MISSING:-0}

heartbeat_dir="${AWG_ROOT}/heartbeats/${WORKER}"
session=${AWG_WORKER_SESSION:-}

# Drain stdin so the hook dispatcher's pipe never blocks even though we
# do not consume the payload.
if [ -t 0 ]; then
  :
else
  cat >/dev/null 2>&1 || true
fi

if [ ! -d "$heartbeat_dir" ]; then
  echo "CRITICAL: no heartbeat directory for worker=${WORKER} at ${heartbeat_dir}"
  if [ "$HEARTBEAT_FAIL_ON_MISSING" = "1" ]; then
    exit 1
  fi
  exit 0
fi

heartbeat_file=""
if [ -n "$session" ]; then
  heartbeat_file="${heartbeat_dir}/${session}.ts"
else
  # Pick the freshest .ts file in the directory.
  newest_mtime=0
  while IFS= read -r candidate; do
    [ -f "$candidate" ] || continue
    mtime=$(stat -f %m "$candidate" 2>/dev/null || stat -c %Y "$candidate" 2>/dev/null || echo 0)
    if [ "$mtime" -gt "$newest_mtime" ]; then
      newest_mtime=$mtime
      heartbeat_file=$candidate
    fi
  done < <(find "$heartbeat_dir" -maxdepth 1 -type f -name '*.ts' 2>/dev/null)
fi

if [ -z "$heartbeat_file" ] || [ ! -f "$heartbeat_file" ]; then
  echo "CRITICAL: missing heartbeat file for worker=${WORKER} session=${session:-<any>}"
  if [ "$HEARTBEAT_FAIL_ON_MISSING" = "1" ]; then
    exit 1
  fi
  exit 0
fi

timestamp=$(head -n1 "$heartbeat_file" 2>/dev/null | tr -d '[:space:]' || true)
if [ -z "$timestamp" ] || ! [[ "$timestamp" =~ ^[0-9]+$ ]]; then
  echo "CRITICAL: heartbeat file is empty or non-numeric: ${heartbeat_file}"
  exit 0
fi

now=$(date +%s)
age=$((now - timestamp))

if [ "$age" -gt "$WORKER_HEARTBEAT_TIMEOUT" ]; then
  echo "WARNING: heartbeat stale for worker=${WORKER} session=${session:-$(basename "${heartbeat_file%.ts}")} age=${age}s timeout=${WORKER_HEARTBEAT_TIMEOUT}s"
  exit 0
fi

echo "OK: heartbeat fresh for worker=${WORKER} session=${session:-$(basename "${heartbeat_file%.ts}")} age=${age}s"
exit 0
