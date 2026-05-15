#!/usr/bin/env bash
set -euo pipefail

# Category: worker-infrastructure
# Role: tmux supervisor for the Claude worker loop (start/status/stop/kill/log).

# Auto-detect awg CLI: prefer env var, then repo-local .venv/bin/awg, then PATH.
_awg_autodetect() {
  local repo_root
  repo_root=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
  if [[ -x "${repo_root}/.venv/bin/awg" ]]; then
    echo "${repo_root}/.venv/bin/awg"
  else
    echo "awg"
  fi
}
AWG_CLI=${AWG_CLI:-$(_awg_autodetect)}
AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
WORKER=${WORKER:-worker}
LEAD=${LEAD:-lead}
SESSION=${SESSION:-"awg-claude-${WORKER}"}
LOG_DIR=${LOG_DIR:-"${AWG_ROOT}/log/claude-worker"}
SUMMARY_DIR=${SUMMARY_DIR:-"${LOG_DIR}/run-summaries"}
LOG_FILE=${LOG_FILE:-"${LOG_DIR}/${SESSION}.log"}
RECV_TIMEOUT=${RECV_TIMEOUT:-5}
AWG_REPORT_TARGET=${AWG_REPORT_TARGET:-}
MAX_TASKS=${MAX_TASKS:-1}
MAX_IDLE_SECONDS=${MAX_IDLE_SECONDS:-900}
MAX_RECV_ERRORS=${MAX_RECV_ERRORS:-3}
REPORT_STATUS=${REPORT_STATUS:-1}
AGENT=${AGENT:-claude}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WORKER_SCRIPT=${WORKER_SCRIPT:-"${SCRIPT_DIR}/awg-claude-worker-loop.sh"}
LOCK_PATH="${AWG_ROOT}/tmp/locks/${WORKER}-claude-worker-loop.lockdir"
ENV_FILE="${AWG_ROOT}/tmp/${WORKER}-env.sh"


json_file_count() {
  local dir=$1
  if [[ ! -d "$dir" ]]; then
    echo 0
    return 0
  fi
  find "$dir" -maxdepth 1 -name '*.json' -type f | wc -l | tr -d ' '
}

queue_item_summary() {
  local file=$1
  python3 - "$file" <<'PYSUMMARY' 2>/dev/null || echo "parse error"
import json
import sys
from pathlib import Path

try:
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
except Exception as exc:
    print(f"parse error: {exc}")
    raise SystemExit(0)

print(
    str(data.get("id", "?"))[:12],
    data.get("kind", "?"),
    "from:",
    data.get("from", "?"),
    "to:",
    data.get("to", "?"),
)
PYSUMMARY
}

latest_summary() {
  if [[ ! -d "$SUMMARY_DIR" ]]; then
    return 1
  fi
  find "$SUMMARY_DIR" -maxdepth 1 -type f -name "${WORKER}.summary.*.json" -print0 2>/dev/null \
    | xargs -0 ls -t 2>/dev/null \
    | head -n 1
}

usage() {
  cat <<USAGE
Usage: awg-claude-worker-tmux.sh <start|status|stop|kill|log|requeue-stale|health|cleanup-worker>

Environment: AWG_ROOT, AWG_CLI, WORKER, LEAD, SESSION, MAX_TASKS,
MAX_IDLE_SECONDS, RECV_TIMEOUT, MAX_RECV_ERRORS, REPORT_STATUS, LOG_FILE,
SUMMARY_DIR, AWG_REPORT_TARGET, AGENT (claude|codex),
AWG_CLAUDE_BIN, AWG_CLAUDE_REPO, AWG_CLAUDE_TIMEOUT_SECONDS,
AWG_CLAUDE_DANGEROUSLY_SKIP_PERMS, AWG_CLAUDE_ALLOW_DIRTY, AWG_FALLBACK.

Commands:
  start           Start worker in tmux session
  status          Show session and queue status
  stop            Send SIGINT to worker
  kill            Kill tmux session
  log             Tail worker log
  requeue-stale   Requeue stale processing items
  health          Check queue for dead/stuck items
  cleanup-worker  Archive dead and stuck processing items
USAGE
}

mkdir -p "$LOG_DIR" "$SUMMARY_DIR" "${AWG_ROOT}/tmp/locks"
cmd=${1:-}
case "$cmd" in
  start)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "session already exists: $SESSION" >&2
      exit 69
    fi
    if [[ -d "$LOCK_PATH" ]]; then
      echo "claude worker lock exists; inspect before removing: $LOCK_PATH" >&2
      exit 71
    fi
    {
      printf '[%s] pre-start status worker=%s agent=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$WORKER" "$AGENT"
      status_args=(--root "$AWG_ROOT" status --as "$WORKER")
      if [[ -n "$AWG_REPORT_TARGET" ]]; then
        status_args+=(--report-target "$AWG_REPORT_TARGET")
      fi
      "$AWG_CLI" "${status_args[@]}"
    } >>"$LOG_FILE" 2>&1
    # Write env file for tmux session (avoids printf %q escaping issues)
    mkdir -p "${AWG_ROOT}/tmp"
    cat >"$ENV_FILE" <<ENVEOF
export AWG_CLI=$(printf '%q' "$AWG_CLI")
export AWG_ROOT=$(printf '%q' "$AWG_ROOT")
export WORKER=$(printf '%q' "$WORKER")
export LEAD=$(printf '%q' "$LEAD")
export LOG_DIR=$(printf '%q' "$LOG_DIR")
export SUMMARY_DIR=$(printf '%q' "$SUMMARY_DIR")
export RUN_LOG_FILE=$(printf '%q' "$LOG_FILE")
export RECV_TIMEOUT=$(printf '%q' "$RECV_TIMEOUT")
export AWG_REPORT_TARGET=$(printf '%q' "$AWG_REPORT_TARGET")
export MAX_TASKS=$(printf '%q' "$MAX_TASKS")
export MAX_IDLE_SECONDS=$(printf '%q' "$MAX_IDLE_SECONDS")
export MAX_RECV_ERRORS=$(printf '%q' "$MAX_RECV_ERRORS")
export REPORT_STATUS=$(printf '%q' "$REPORT_STATUS")
export AGENT=$(printf '%q' "$AGENT")
export AWG_CLAUDE_BIN=$(printf '%q' "${AWG_CLAUDE_BIN:-claude}")
export AWG_CLAUDE_REPO=$(printf '%q' "${AWG_CLAUDE_REPO:-}")
export AWG_CLAUDE_TIMEOUT_SECONDS=$(printf '%q' "${AWG_CLAUDE_TIMEOUT_SECONDS:-900}")
export AWG_CLAUDE_DANGEROUSLY_SKIP_PERMS=$(printf '%q' "${AWG_CLAUDE_DANGEROUSLY_SKIP_PERMS:-1}")
export AWG_CLAUDE_MODEL=$(printf '%q' "${AWG_CLAUDE_MODEL:-}")
export AWG_FALLBACK=$(printf '%q' "${AWG_FALLBACK:-1}")
export AWG_CLAUDE_ALLOW_DIRTY=$(printf '%q' "${AWG_CLAUDE_ALLOW_DIRTY:-0}")
ENVEOF
    tmux new-session -d -s "$SESSION" "exec > >(tee -a $(printf %q "$LOG_FILE")) 2>&1; source $(printf %q "$ENV_FILE"); exec bash $(printf %q "$WORKER_SCRIPT")"
    echo "started session=$SESSION worker=$WORKER agent=$AGENT log=$LOG_FILE"
    ;;
  status)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "session=$SESSION running"
    else
      echo "session=$SESSION stopped"
    fi
    status_args=(--root "$AWG_ROOT" status --as "$WORKER")
    if [[ -n "$AWG_REPORT_TARGET" ]]; then
      status_args+=(--report-target "$AWG_REPORT_TARGET")
    fi
    "$AWG_CLI" "${status_args[@]}"
    if summary_path=$(latest_summary) && [[ -n "$summary_path" ]]; then
      echo "latest_summary=$summary_path"
    else
      echo "latest_summary=none"
    fi
    ;;
  stop)
    tmux send-keys -t "$SESSION" C-c 2>/dev/null || true
    ;;
  kill)
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    ;;
  log)
    tail -n "${LINES:-80}" "$LOG_FILE"
    ;;
  requeue-stale)
    "$AWG_CLI" --root "$AWG_ROOT" requeue-stale --as "$WORKER" --older-than-sec "${STALE_SECONDS:-600}" --max-retries "${MAX_RETRIES:-3}"
    ;;
  health)
    # Check and report queue health: dead items, stuck processing, inbox orphanage
    echo "=== Queue health for $WORKER ==="
    echo ""
    issues=0
    for dir in dead processing inbox pending; do
      full_dir="${AWG_ROOT}/queues/${WORKER}/${dir}"
      count=$(json_file_count "$full_dir")
      if [[ "$count" -gt 0 ]]; then
        echo "WARN ${dir}: ${count} item(s)"
        issues=$((issues + 1))
        for f in "$full_dir"/*.json; do
          [ -f "$f" ] || continue
          echo "  - $(queue_item_summary "$f")"
        done
      fi
    done
    echo ""
    if [[ "$issues" -eq 0 ]]; then
      echo "OK Queue is clean"
    else
      echo "Run: $0 cleanup-worker to archive dead/stuck items"
    fi
    ;;
  cleanup-worker)
    # Archive dead items and stuck processing items; do not delete audit data.
    echo "=== Cleaning up queue for $WORKER ==="
    archive_dir="${AWG_ROOT}/log/queue-cleanups/$(date -u +%Y%m%dT%H%M%SZ)-${WORKER}"
    mkdir -p "$archive_dir"
    for dir in dead processing; do
      full_dir="${AWG_ROOT}/queues/${WORKER}/${dir}"
      count=$(json_file_count "$full_dir")
      if [[ "$count" -gt 0 ]]; then
        dest="${archive_dir}/${dir}"
        mkdir -p "$dest"
        echo "Archiving ${count} ${dir} item(s) to ${dest}..."
        mv "$full_dir"/*.json "$dest"/
        echo "  OK Archived"
      fi
    done
    # Check for orphaned inbox items (items sent to wrong queue name)
    inbox_dir="${AWG_ROOT}/queues/${WORKER}/inbox"
    inbox_count=$(json_file_count "$inbox_dir")
    if [[ "$inbox_count" -gt 0 ]]; then
      echo "WARN Found ${inbox_count} inbox item(s); review manually before moving"
      for f in "$inbox_dir"/*.json; do
        [ -f "$f" ] || continue
        echo "  - $(queue_item_summary "$f")"
      done
    fi
    echo ""
    "$AWG_CLI" --root "$AWG_ROOT" status --as "$WORKER"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
