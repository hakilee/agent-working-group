#!/usr/bin/env bash
set -euo pipefail

AWG_CLI=${AWG_CLI:-awg}
AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
WORKER=${WORKER:-worker}
LEAD=${LEAD:-lead}
SESSION=${SESSION:-"awg-worker-${WORKER}"}
LOG_DIR=${LOG_DIR:-"${AWG_ROOT}/log/worker-sessions"}
LOG_FILE=${LOG_FILE:-"${LOG_DIR}/${SESSION}.log"}
RECV_TIMEOUT=${RECV_TIMEOUT:-5}
AWG_REPORT_TARGET=${AWG_REPORT_TARGET:-}
MAX_TASKS=${MAX_TASKS:-25}
MAX_IDLE_SECONDS=${MAX_IDLE_SECONDS:-1800}
MAX_RECV_ERRORS=${MAX_RECV_ERRORS:-3}
REPORT_STATUS=${REPORT_STATUS:-1}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WORKER_SCRIPT=${WORKER_SCRIPT:-"${SCRIPT_DIR}/awg-worker-loop.sh"}
LOCK_PATH="${AWG_ROOT}/tmp/locks/${WORKER}-worker-loop.lockdir"

usage() {
  cat <<USAGE
Usage: awg-worker-tmux.sh <start|status|stop|kill|log|requeue-stale>

Environment: AWG_ROOT, AWG_CLI, WORKER, LEAD, SESSION, MAX_TASKS, MAX_IDLE_SECONDS,
RECV_TIMEOUT, AWG_REPORT_TARGET, MAX_RECV_ERRORS, REPORT_STATUS, LOG_FILE.
USAGE
}

mkdir -p "$LOG_DIR" "${AWG_ROOT}/tmp/locks"
cmd=${1:-}
case "$cmd" in
  start)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "session already exists: $SESSION" >&2
      exit 69
    fi
    if [[ -d "$LOCK_PATH" ]]; then
      echo "worker lock exists; inspect before removing: $LOCK_PATH" >&2
      exit 71
    fi
    {
      printf '[%s] pre-start status worker=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$WORKER"
      status_args=(--root "$AWG_ROOT" status --as "$WORKER")
      if [[ -n "$AWG_REPORT_TARGET" ]]; then
        status_args+=(--report-target "$AWG_REPORT_TARGET")
      fi
      "$AWG_CLI" "${status_args[@]}"
    } >>"$LOG_FILE" 2>&1
    tmux new-session -d -s "$SESSION" "exec > >(tee -a $(printf %q "$LOG_FILE")) 2>&1; export AWG_CLI=$(printf %q "$AWG_CLI") AWG_ROOT=$(printf %q "$AWG_ROOT") WORKER=$(printf %q "$WORKER") LEAD=$(printf %q "$LEAD") LOG_DIR=$(printf %q "$LOG_DIR") RECV_TIMEOUT=$(printf %q "$RECV_TIMEOUT") AWG_REPORT_TARGET=$(printf %q "$AWG_REPORT_TARGET") MAX_TASKS=$(printf %q "$MAX_TASKS") MAX_IDLE_SECONDS=$(printf %q "$MAX_IDLE_SECONDS") MAX_RECV_ERRORS=$(printf %q "$MAX_RECV_ERRORS") REPORT_STATUS=$(printf %q "$REPORT_STATUS"); exec bash $(printf %q "$WORKER_SCRIPT")"
    echo "started session=$SESSION worker=$WORKER log=$LOG_FILE"
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
