#!/usr/bin/env bash
set -euo pipefail

# awg-hook-pr-publish-gate.sh — Read-only gate check triggered on publish intent.
#
# Reads the hook message JSON from stdin. Extracts repo and PR refs from
# the message, runs the publish gate check, and reports the result.
#
# Usage from hooks.json:
#   {
#     "name": "pr-publish-gate",
#     "event": "message.sent",
#     "command": ["scripts/awg-hook-pr-publish-gate.sh"],
#     "filters": {"kind": "publish"},
#     "timeoutSeconds": 30
#   }

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GATE_SCRIPT="${SCRIPT_DIR}/awg-pr-publish-gate-check.sh"

# Parse message JSON from stdin for refs
msg_json=$(cat)

repo=$(printf '%s' "$msg_json" | python3 -c "
import json, sys
msg = json.load(sys.stdin)
refs = msg.get('refs') or {}
print(refs.get('repo', ''))
" 2>/dev/null || echo "")

pr=$(printf '%s' "$msg_json" | python3 -c "
import json, sys
msg = json.load(sys.stdin)
refs = msg.get('refs') or {}
print(refs.get('pr', ''))
" 2>/dev/null || echo "")

skip_reason=$(printf '%s' "$msg_json" | python3 -c "
import json, sys
msg = json.load(sys.stdin)
refs = msg.get('refs') or {}
print(refs.get('skipReason', ''))
" 2>/dev/null || echo "")

if [ -z "$repo" ] || [ -z "$pr" ]; then
  echo "gate skip: repo or pr ref missing in message" >&2
  exit 0
fi

gate_args=("--repo" "$repo" "--pr" "$pr")
if [ -n "$skip_reason" ]; then
  gate_args+=("--skip-reason" "$skip_reason")
fi

if "$GATE_SCRIPT" "${gate_args[@]}"; then
  echo "gate pass: repo=${repo} pr=${pr}"
  exit 0
else
  echo "gate fail: repo=${repo} pr=${pr}" >&2
  exit 1
fi
