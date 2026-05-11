#!/usr/bin/env bash
set -euo pipefail

# awg-agent-executor.sh — Dual-agent executor with automatic 429 fallback.
#
# Tries the primary agent (codex or claude). If the executor returns a
# structured JSON result with status=retry and a rate-limit indicator,
# falls back to the other agent automatically.
#
# Usage from worker loop:
#   AGENT=claude scripts/awg-agent-executor.sh MESSAGE_FILE
#   AGENT=codex scripts/awg-agent-executor.sh MESSAGE_FILE
#
# Environment:
#   AGENT              Primary agent: "codex" or "claude" (default: claude)
#   AWG_FALLBACK       Enable fallback: "1" (default) or "0"
#   AWG_AGENT_TIMEOUT  Per-agent timeout in seconds (default: 900)

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AGENT=${AGENT:-claude}
FALLBACK=${AWG_FALLBACK:-1}
AGENT_TIMEOUT=${AWG_AGENT_TIMEOUT:-900}
MESSAGE_FILE=${1:-}

usage() {
  cat <<USAGE
Usage: scripts/awg-agent-executor.sh MESSAGE_FILE

Environment: AGENT (codex|claude), AWG_FALLBACK (0|1), AWG_AGENT_TIMEOUT.
Tries AGENT first; on 429 rate limit, falls back to the other agent.
USAGE
}

if [[ -z "$MESSAGE_FILE" || ! -f "$MESSAGE_FILE" ]]; then
  echo '{"status":"failed","summary":"missing message file"}'
  exit 0
fi

case "$AGENT" in
  codex) PRIMARY="$SCRIPT_DIR/awg-codex-executor.sh"; SECONDARY="$SCRIPT_DIR/awg-claude-executor.sh"; PRIMARY_NAME=codex; SECONDARY_NAME=claude ;;
  claude) PRIMARY="$SCRIPT_DIR/awg-claude-executor.sh"; SECONDARY="$SCRIPT_DIR/awg-codex-executor.sh"; PRIMARY_NAME=claude; SECONDARY_NAME=codex ;;
  *)
    echo "unknown AGENT=$AGENT; must be codex or claude" >&2
    exit 64
    ;;
esac

run_executor() {
  local executor=$1
  local name=$2
  local result
  result=$("$executor" "$MESSAGE_FILE" 2>&1) || true
  echo "$result"
}

is_rate_limited() {
  local json=$1
  # Check status=retry AND rate-limit indicators in summary
  local status summary
  status=$(echo "$json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
  summary=$(echo "$json" | python3 -c "import json,sys; s=json.load(sys.stdin).get('summary',''); print(s.lower())" 2>/dev/null || echo "")
  if [[ "$status" == "retry" ]]; then
    if echo "$summary" | grep -qi "429\|rate.limit\|overloaded\|capacity"; then
      return 0
    fi
  fi
  return 1
}

# Run primary
PRIMARY_RESULT=$(run_executor "$PRIMARY" "$PRIMARY_NAME")

# If primary succeeded, return immediately
PRIMARY_STATUS=$(echo "$PRIMARY_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
if [[ "$PRIMARY_STATUS" == "success" || "$PRIMARY_STATUS" == "question" || "$PRIMARY_STATUS" == "blocker" ]]; then
  echo "$PRIMARY_RESULT"
  exit 0
fi

# Check for rate limit and fallback
if [[ "$FALLBACK" == "1" ]] && is_rate_limited "$PRIMARY_RESULT"; then
  printf '[%s] %s rate limited, falling back to %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PRIMARY_NAME" "$SECONDARY_NAME" >&2
  SECONDARY_RESULT=$(run_executor "$SECONDARY" "$SECONDARY_NAME")

  # If secondary also rate limited, return the primary error
  if is_rate_limited "$SECONDARY_RESULT"; then
    printf '[%s] both agents rate limited; returning primary result\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
    echo "$PRIMARY_RESULT"
    exit 0
  fi

  echo "$SECONDARY_RESULT"
  exit 0
fi

# Primary failed for non-rate-limit reason — return as-is
echo "$PRIMARY_RESULT"
exit 0
