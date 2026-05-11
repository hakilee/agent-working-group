#!/usr/bin/env bash
set -euo pipefail

# Category: hook
# Role: Hook adapter that runs a read-only preflight safety check for bounded worker spawns.
#
# awg-hook-worker-preflight.sh — Read-only preflight check for bounded workers.
#
# Reads the hook message JSON from stdin. Exits 0 if safe to proceed,
# non-zero with a reason on stderr otherwise.
#
# Checks:
#   1. AWG_REPORT_TARGET is set (prevents cross-channel scope leaks)
#   2. Pending count for role is within MAX_PENDING (default 50)
#   3. No duplicate worker lock (prevents double dispatch)
#
# Usage from hooks.json:
#   {
#     "name": "worker-preflight",
#     "event": "message.pending",
#     "command": ["scripts/awg-hook-worker-preflight.sh"],
#     "filters": {"to": "worker"},
#     "timeoutSeconds": 10
#   }

AWG_CLI=${AWG_CLI:-awg}
AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
WORKER=${AWG_MESSAGE_TO:-worker}
MAX_PENDING=${MAX_PENDING:-50}
LOCK_DIR="${AWG_ROOT}/tmp/locks"

# 1. Report target must be set
if [ -z "${AWG_REPORT_TARGET:-}" ]; then
  echo "preflight fail: AWG_REPORT_TARGET not set" >&2
  exit 1
fi

# 2. Pending count check
pending=$("$AWG_CLI" --root "$AWG_ROOT" status --as "$WORKER" 2>/dev/null \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('pending',0))" 2>/dev/null || echo "0")

if [ "$pending" -gt "$MAX_PENDING" ]; then
  echo "preflight fail: pending=${pending} exceeds MAX_PENDING=${MAX_PENDING}" >&2
  exit 1
fi

# 3. Duplicate worker lock check
if [ -d "${LOCK_DIR}/${WORKER}-worker-loop.lockdir" ]; then
  lock_pid="${LOCK_DIR}/${WORKER}-worker-loop.lockdir/pid"
  if [ -f "$lock_pid" ]; then
    lock_pid_val=$(cat "$lock_pid" 2>/dev/null || echo "")
    if [ -n "$lock_pid_val" ] && kill -0 "$lock_pid_val" 2>/dev/null; then
      echo "preflight fail: worker ${WORKER} already running (pid=${lock_pid_val})" >&2
      exit 1
    fi
  fi
fi

echo "preflight ok: worker=${WORKER} report_target=${AWG_REPORT_TARGET} pending=${pending}"
exit 0
