#!/usr/bin/env bash
# tmux-completion-watcher.sh — Poll tmux sessions for CLI completion and notify
# Usage: tmux-completion-watcher.sh <session1,session2,...> <discord_channel_id> [check_interval_seconds]
#
# Detects when interactive CLIs (claude, codex) finish by checking for shell prompts.
# On completion: captures output, sends Discord summary, writes result files.
#
# Exit: 0 when all sessions complete, 1 on error/timeout

set -euo pipefail

SESSIONS="${1:?Usage: tmux-completion-watcher.sh <session1,session2,...> <discord_channel_id> [interval]}"
DISCORD_CHANNEL="${2:?Discord channel ID required}"
INTERVAL="${3:-30}"
TIMEOUT="${4:-1800}" # 30 min default max

AWG_REPO="/Users/haklee/claws/workspaces/agent-working-group"
RESULT_DIR="/tmp/awg-tmux-results"
mkdir -p "$RESULT_DIR"

# Detect shell prompt (zsh %, bash $) or session not found
is_done() {
  local session="$1"
  # Check session exists
  if ! tmux has-session -t "$session" 2>/dev/null; then
    echo "gone"
    return 0
  fi
  # Get last 3 lines
  local output
  output=$(tmux capture-pane -t "$session" -p 2>/dev/null | tail -3)
  # Shell prompt patterns: ends with % or $ followed by space (zsh/bash prompt)
  # Also detect "Process exited" or explicit completion markers
  if echo "$output" | grep -qE '%\s*$|(\$|#)\s*$'; then
    echo "done"
    return 0
  fi
  echo "running"
  return 0
}

elapsed=0
declare -A completed

echo "[$(date -Iseconds)] Watching sessions: $SESSIONS (interval=${INTERVAL}s, timeout=${TIMEOUT}s)"

while [ "$elapsed" -lt "$TIMEOUT" ]; do
  IFS=',' read -ra SESSION_LIST <<< "$SESSIONS"
  all_done=true

  for session in "${SESSION_LIST[@]}"; do
    if [ -n "${completed[$session]:-}" ]; then
      continue
    fi

    status=$(is_done "$session")
    
    if [ "$status" = "done" ] || [ "$status" = "gone" ]; then
      echo "[$(date -Iseconds)] Session '$session' completed (status=$status)"
      
      # Capture full output
      if [ "$status" = "done" ]; then
        tmux capture-pane -t "$session" -p -S - > "$RESULT_DIR/${session}-output.txt" 2>/dev/null || true
      fi
      
      # Kill the session
      tmux kill-session -t "$session" 2>/dev/null || true
      
      completed["$session"]=1
      
      # Write completion marker
      echo "${session}: ${status} at $(date -Iseconds)" >> "$RESULT_DIR/completions.log"
    else
      all_done=false
    fi
  done

  if [ "$all_done" = true ]; then
    echo "[$(date -Iseconds)] All sessions completed"
    echo "all_done" > "$RESULT_DIR/status"
    exit 0
  fi

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
done

echo "[$(date -Iseconds)] Timeout reached (${TIMEOUT}s)"
echo "timeout" > "$RESULT_DIR/status"
exit 1
