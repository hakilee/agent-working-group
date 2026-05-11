#!/usr/bin/env bash
set -euo pipefail

# Category: queue-ops
# Role: Read-only scan of all queues/*/processing/ for items past AWG_PROCESSING_TIMEOUT.
#
# awg-processing-timeout-check.sh — Read-only processing-timeout audit.
#
# For each .json file under $AWG_ROOT/queues/*/processing/, this script
# compares "now" against either the message's refs.processingSince /
# processingSince field (epoch ms) or the file mtime, and reports any
# item that has been in processing longer than AWG_PROCESSING_TIMEOUT
# seconds (default 600).
#
# Exit codes:
#   0 — no items exceeded the timeout
#   1 — at least one stale item was reported
#
# Behavior:
#   - Never moves, deletes, mutates, or acks any queue file.
#   - Suitable for cron, dispatcher loops, or dashboard polling.
#   - Reports one line per stale item to stdout in the form:
#       STALE agent=<role> id=<message-id> age=<seconds>s timeout=<seconds>s file=<basename>
#   - Summary line to stderr.

AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
AWG_PROCESSING_TIMEOUT=${AWG_PROCESSING_TIMEOUT:-600}

if [ ! -d "${AWG_ROOT}/queues" ]; then
  echo "no queues directory at ${AWG_ROOT}/queues" >&2
  exit 0
fi

now=$(date +%s)
stale_count=0
scanned=0

mtime_of() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0
}

while IFS= read -r processing_dir; do
  agent=$(basename "$(dirname "$processing_dir")")
  while IFS= read -r json_file; do
    [ -f "$json_file" ] || continue
    scanned=$((scanned + 1))

    # Try processingSince (epoch ms) from refs or top-level; fall back to mtime.
    since_ms=$(python3 - "$json_file" <<'PY' 2>/dev/null || echo ""
import json, sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        msg = json.load(fh)
except Exception:
    sys.exit(0)
refs = msg.get("refs") or {}
val = refs.get("processingSince") or msg.get("processingSince")
if isinstance(val, (int, float)) and val > 0:
    print(int(val))
    sys.exit(0)
val = refs.get("receivedAtMs")
if isinstance(val, (int, float)) and val > 0:
    print(int(val))
PY
)

    if [ -n "$since_ms" ]; then
      since_s=$((since_ms / 1000))
    else
      since_s=$(mtime_of "$json_file")
    fi

    age=$((now - since_s))
    if [ "$age" -gt "$AWG_PROCESSING_TIMEOUT" ]; then
      id=$(python3 - "$json_file" <<'PY' 2>/dev/null || echo ""
import json, sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        print(json.load(fh).get("id", ""))
except Exception:
    pass
PY
)
      basename=$(basename "$json_file")
      echo "STALE agent=${agent} id=${id} age=${age}s timeout=${AWG_PROCESSING_TIMEOUT}s file=${basename}"
      stale_count=$((stale_count + 1))
    fi
  done < <(find "$processing_dir" -maxdepth 1 -type f -name '*.json' 2>/dev/null)
done < <(find "${AWG_ROOT}/queues" -mindepth 2 -maxdepth 2 -type d -name processing 2>/dev/null)

echo "scanned=${scanned} stale=${stale_count} timeout=${AWG_PROCESSING_TIMEOUT}s" >&2

if [ "$stale_count" -gt 0 ]; then
  exit 1
fi
exit 0
