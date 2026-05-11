#!/usr/bin/env bash
set -euo pipefail

# Category: queue-ops
# Role: Read-only audit of expectedResponseWithin contracts across inbox/ and processing/.
#
# awg-response-contract-check.sh — Read-only response-contract audit.
#
# Scans every $AWG_ROOT/queues/*/inbox/*.json and
# $AWG_ROOT/queues/*/processing/*.json. For each item that carries an
# integer "expectedResponseWithin" field (seconds), compares the elapsed
# time since send against the contract.
#
# Time since send is taken from the message's createdAtMs (epoch ms)
# when available, falling back to the filename's leading timestamp
# (also epoch ms).
#
# Exit codes:
#   0 — no breached contracts
#   1 — at least one breached contract
#
# Behavior:
#   - Never moves, deletes, mutates, or acks any queue file.
#   - Reports one line per breach to stdout in the form:
#       BREACH agent=<role> id=<id> location=<inbox|processing> expected=<s>s actual=<s>s file=<basename>
#   - Summary on stderr.

AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}

if [ ! -d "${AWG_ROOT}/queues" ]; then
  echo "no queues directory at ${AWG_ROOT}/queues" >&2
  exit 0
fi

now=$(date +%s)
breach_count=0
scanned=0

scan_dir() {
  local agent=$1
  local location=$2
  local target=$3

  [ -d "$target" ] || return 0

  while IFS= read -r json_file; do
    [ -f "$json_file" ] || continue
    scanned=$((scanned + 1))
    read -r expected_seconds id sent_ms < <(python3 - "$json_file" <<'PY' 2>/dev/null || echo "0  0"
import json, sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        msg = json.load(fh)
except Exception:
    print("0  0")
    sys.exit(0)
expected = msg.get("expectedResponseWithin")
created = msg.get("createdAtMs")
if not (isinstance(expected, int) and expected > 0):
    print("0  0")
    sys.exit(0)
print("{} {} {}".format(
    int(expected),
    msg.get("id", "") or "-",
    int(created) if isinstance(created, (int, float)) and created > 0 else 0,
))
PY
)
    if [ "${expected_seconds:-0}" -le 0 ]; then
      continue
    fi
    if [ "${sent_ms:-0}" -le 0 ]; then
      filename=$(basename "$json_file")
      ts_prefix=${filename%%_*}
      if [[ "$ts_prefix" =~ ^[0-9]+$ ]]; then
        sent_ms=$ts_prefix
      else
        continue
      fi
    fi
    sent_s=$((sent_ms / 1000))
    actual=$((now - sent_s))
    if [ "$actual" -gt "$expected_seconds" ]; then
      basename=$(basename "$json_file")
      echo "BREACH agent=${agent} id=${id} location=${location} expected=${expected_seconds}s actual=${actual}s file=${basename}"
      breach_count=$((breach_count + 1))
    fi
  done < <(find "$target" -maxdepth 1 -type f -name '*.json' 2>/dev/null)
}

while IFS= read -r agent_dir; do
  agent=$(basename "$agent_dir")
  scan_dir "$agent" inbox "${agent_dir}/inbox"
  scan_dir "$agent" processing "${agent_dir}/processing"
done < <(find "${AWG_ROOT}/queues" -mindepth 1 -maxdepth 1 -type d 2>/dev/null)

echo "scanned=${scanned} breaches=${breach_count}" >&2

if [ "$breach_count" -gt 0 ]; then
  exit 1
fi
exit 0
