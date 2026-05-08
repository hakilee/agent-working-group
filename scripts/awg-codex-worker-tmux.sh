#!/usr/bin/env bash
set -euo pipefail

AWG_CLI=${AWG_CLI:-awg}
AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
WORKER=${WORKER:-codex-worker}
LEAD=${LEAD:-lead}
SESSION=${SESSION:-"awg-codex-${WORKER}"}
LOG_DIR=${LOG_DIR:-"${AWG_ROOT}/log/codex-worker"}
SUMMARY_DIR=${SUMMARY_DIR:-"${LOG_DIR}/run-summaries"}
LOG_FILE=${LOG_FILE:-"${LOG_DIR}/${SESSION}.log"}
RECV_TIMEOUT=${RECV_TIMEOUT:-5}
MAX_TASKS=${MAX_TASKS:-1}
MAX_IDLE_SECONDS=${MAX_IDLE_SECONDS:-900}
MAX_RECV_ERRORS=${MAX_RECV_ERRORS:-3}
REPORT_STATUS=${REPORT_STATUS:-1}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WORKER_SCRIPT=${WORKER_SCRIPT:-"${SCRIPT_DIR}/awg-codex-worker-loop.sh"}
LOCK_PATH="${AWG_ROOT}/tmp/locks/${WORKER}-codex-worker-loop.lockdir"

latest_summary() {
  if [[ ! -d "$SUMMARY_DIR" ]]; then
    return 1
  fi
  find "$SUMMARY_DIR" -maxdepth 1 -type f -name "${WORKER}.summary.*.json" -print0 2>/dev/null     | xargs -0 ls -t 2>/dev/null     | head -n 1
}

usage() {
  cat <<USAGE
Usage: awg-codex-worker-tmux.sh <start|status|stop|kill|log|requeue-stale>

Environment: AWG_ROOT, AWG_CLI, WORKER, LEAD, SESSION, MAX_TASKS,
MAX_IDLE_SECONDS, RECV_TIMEOUT, MAX_RECV_ERRORS, REPORT_STATUS, LOG_FILE, SUMMARY_DIR,
AWG_CODEX_BIN, AWG_CODEX_REPO, AWG_CODEX_TIMEOUT_SECONDS.
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
      echo "codex worker lock exists; inspect before removing: $LOCK_PATH" >&2
      exit 71
    fi
    {
      printf '[%s] pre-start status worker=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$WORKER"
      "$AWG_CLI" --root "$AWG_ROOT" status --as "$WORKER"
    } >>"$LOG_FILE" 2>&1
    tmux new-session -d -s "$SESSION" "exec > >(tee -a $(printf %q "$LOG_FILE")) 2>&1; export AWG_CLI=$(printf %q "$AWG_CLI") AWG_ROOT=$(printf %q "$AWG_ROOT") WORKER=$(printf %q "$WORKER") LEAD=$(printf %q "$LEAD") LOG_DIR=$(printf %q "$LOG_DIR") SUMMARY_DIR=$(printf %q "$SUMMARY_DIR") RUN_LOG_FILE=$(printf %q "$LOG_FILE") RECV_TIMEOUT=$(printf %q "$RECV_TIMEOUT") MAX_TASKS=$(printf %q "$MAX_TASKS") MAX_IDLE_SECONDS=$(printf %q "$MAX_IDLE_SECONDS") MAX_RECV_ERRORS=$(printf %q "$MAX_RECV_ERRORS") REPORT_STATUS=$(printf %q "$REPORT_STATUS") AWG_CODEX_BIN=$(printf %q "${AWG_CODEX_BIN:-codex}") AWG_CODEX_REPO=$(printf %q "${AWG_CODEX_REPO:-}") AWG_CODEX_TIMEOUT_SECONDS=$(printf %q "${AWG_CODEX_TIMEOUT_SECONDS:-900}") AWG_CODEX_EPHEMERAL=$(printf %q "${AWG_CODEX_EPHEMERAL:-1}") AWG_CODEX_OUTPUT_DIR=$(printf %q "${AWG_CODEX_OUTPUT_DIR:-$LOG_DIR}"); exec bash $(printf %q "$WORKER_SCRIPT")"
    echo "started session=$SESSION worker=$WORKER log=$LOG_FILE"
    ;;
  status)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "session=$SESSION running"
    else
      echo "session=$SESSION stopped"
    fi
    "$AWG_CLI" --root "$AWG_ROOT" status --as "$WORKER"
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
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
