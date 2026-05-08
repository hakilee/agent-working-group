#!/usr/bin/env bash
set -euo pipefail

AWG_CLI=${AWG_CLI:-awg}
AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
WORKER=${WORKER:-codex-worker}
LEAD=${LEAD:-lead}
LOG_DIR=${LOG_DIR:-"${AWG_ROOT}/log/codex-worker"}
RECV_TIMEOUT=${RECV_TIMEOUT:-5}
MAX_TASKS=${MAX_TASKS:-1}
MAX_IDLE_SECONDS=${MAX_IDLE_SECONDS:-900}
MAX_RECV_ERRORS=${MAX_RECV_ERRORS:-3}
REPORT_STATUS=${REPORT_STATUS:-1}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BRIDGE_SCRIPT=${BRIDGE_SCRIPT:-"${SCRIPT_DIR}/awg-executor-bridge.sh"}
CODEX_EXECUTOR=${CODEX_EXECUTOR:-"${SCRIPT_DIR}/awg-codex-executor.sh"}
LOCK_PATH="${AWG_ROOT}/tmp/locks/${WORKER}-codex-worker-loop.lockdir"
TASKS=0
RECV_ERRORS=0
STOP_REASON="unknown"

mkdir -p "$LOG_DIR" "${AWG_ROOT}/tmp/locks"

send_status() {
  [[ "$REPORT_STATUS" == "1" ]] || return 0
  local body=$1
  "$AWG_CLI" --root "$AWG_ROOT" send --from "$WORKER" --to "$LEAD" --kind status --body "$body" >/dev/null || true
}

cleanup() {
  local code=$?
  [[ -d "$LOCK_PATH" ]] && rmdir "$LOCK_PATH" 2>/dev/null || true
  printf '[%s] codex worker stopping worker=%s tasks=%s reason=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$WORKER" "$TASKS" "$STOP_REASON"
  send_status "codex worker stopped: worker=${WORKER} tasks=${TASKS} reason=${STOP_REASON}"
  exit "$code"
}

on_signal() {
  STOP_REASON="signal"
  exit 0
}

if ! mkdir "$LOCK_PATH" 2>/dev/null; then
  printf 'duplicate codex worker lock exists: %s\n' "$LOCK_PATH" >&2
  exit 70
fi
trap cleanup EXIT
trap on_signal INT TERM

IDLE_START_SECONDS=$(date +%s)
printf '[%s] codex worker starting worker=%s lead=%s max_tasks=%s max_idle_seconds=%s recv_timeout=%s max_recv_errors=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$WORKER" "$LEAD" "$MAX_TASKS" "$MAX_IDLE_SECONDS" "$RECV_TIMEOUT" "$MAX_RECV_ERRORS"
send_status "codex worker started: worker=${WORKER} max_tasks=${MAX_TASKS} max_idle_seconds=${MAX_IDLE_SECONDS}"

while true; do
  now=$(date +%s)
  if (( MAX_IDLE_SECONDS > 0 && now - IDLE_START_SECONDS >= MAX_IDLE_SECONDS )); then
    STOP_REASON="idle timeout"
    exit 0
  fi

  marker=$(mktemp "${LOG_DIR}/${WORKER}.bridge-marker.XXXXXX")
  if LOG_DIR="$LOG_DIR" "$BRIDGE_SCRIPT" --worker "$WORKER" --lead "$LEAD" --root "$AWG_ROOT" --timeout "$RECV_TIMEOUT" -- "$CODEX_EXECUTOR"; then
    if [[ -n $(find "$LOG_DIR" -type f -name "${WORKER}.bridge.*.json" -newer "$marker" 2>/dev/null | head -n 1) ]]; then
      TASKS=$((TASKS + 1))
      IDLE_START_SECONDS=$(date +%s)
      RECV_ERRORS=0
      if (( MAX_TASKS > 0 && TASKS >= MAX_TASKS )); then
        rm -f "$marker"
        STOP_REASON="max tasks"
        exit 0
      fi
    fi
    rm -f "$marker"
  else
    RECV_ERRORS=$((RECV_ERRORS + 1))
    printf '[%s] bridge error count=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$RECV_ERRORS" >&2
    if (( MAX_RECV_ERRORS > 0 && RECV_ERRORS >= MAX_RECV_ERRORS )); then
      STOP_REASON="bridge errors"
      exit 1
    fi
  fi
done
