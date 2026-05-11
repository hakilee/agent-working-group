#!/usr/bin/env bash
set -euo pipefail

AWG_CLI=${AWG_CLI:-awg}
AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
WORKER=${WORKER:-claude-worker}
LEAD=${LEAD:-lead}
LOG_DIR=${LOG_DIR:-"${AWG_ROOT}/log/claude-worker"}
SUMMARY_DIR=${SUMMARY_DIR:-"${LOG_DIR}/run-summaries"}
RUN_LOG_FILE=${RUN_LOG_FILE:-}
RECV_TIMEOUT=${RECV_TIMEOUT:-5}
AWG_REPORT_TARGET=${AWG_REPORT_TARGET:-}
MAX_TASKS=${MAX_TASKS:-1}
MAX_IDLE_SECONDS=${MAX_IDLE_SECONDS:-900}
MAX_RECV_ERRORS=${MAX_RECV_ERRORS:-3}
REPORT_STATUS=${REPORT_STATUS:-1}
AGENT=${AGENT:-claude}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BRIDGE_SCRIPT=${BRIDGE_SCRIPT:-"${SCRIPT_DIR}/awg-executor-bridge.sh"}
AGENT_EXECUTOR=${AGENT_EXECUTOR:-"${SCRIPT_DIR}/awg-agent-executor.sh"}
LOCK_PATH="${AWG_ROOT}/tmp/locks/${WORKER}-claude-worker-loop.lockdir"
TASKS=0
RECV_ERRORS=0
STOP_REASON="unknown"

mkdir -p "$LOG_DIR" "$SUMMARY_DIR" "${AWG_ROOT}/tmp/locks"

write_summary() {
  local stopped_at=$1
  local duration_seconds=$2
  local summary_tmp summary_file
  summary_tmp=$(mktemp "${SUMMARY_DIR}/${WORKER}.summary.XXXXXX")
  summary_file="${summary_tmp}.json"
  python3 - "$summary_tmp" "$WORKER" "$LEAD" "$RUN_STARTED_AT" "$stopped_at" "$duration_seconds" "$STOP_REASON" "$TASKS" "$LOG_DIR" "$RUN_LOG_FILE" "$AGENT" <<'PYSUMMARY'
import json
import sys
from pathlib import Path

(path, worker, lead, started_at, stopped_at, duration, reason, tasks, log_dir, log_file, agent) = sys.argv[1:]
payload = {
    "worker": worker,
    "lead": lead,
    "startedAt": started_at,
    "stoppedAt": stopped_at,
    "durationSeconds": int(duration),
    "stopReason": reason,
    "tasks": int(tasks),
    "logDir": log_dir,
    "agent": agent,
}
if log_file:
    payload["logFile"] = log_file
Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PYSUMMARY
  mv "$summary_tmp" "$summary_file"
  printf '[%s] claude worker summary=%s\n' "$stopped_at" "$summary_file"
}

send_status() {
  [[ "$REPORT_STATUS" == "1" ]] || return 0
  local body=$1
  "$AWG_CLI" --root "$AWG_ROOT" send --from "$WORKER" --to "$LEAD" --kind status --body "$body" >/dev/null || true
}

cleanup() {
  local code=$?
  local stopped_at stopped_seconds duration_seconds
  stopped_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  stopped_seconds=$(date +%s)
  duration_seconds=$((stopped_seconds - RUN_STARTED_SECONDS))
  [[ -d "$LOCK_PATH" ]] && rmdir "$LOCK_PATH" 2>/dev/null || true
  printf '[%s] claude worker stopping worker=%s tasks=%s reason=%s\n' "$stopped_at" "$WORKER" "$TASKS" "$STOP_REASON"
  write_summary "$stopped_at" "$duration_seconds"
  send_status "claude worker stopped: worker=${WORKER} tasks=${TASKS} reason=${STOP_REASON} agent=${AGENT}"
  exit "$code"
}

on_signal() {
  STOP_REASON="signal"
  exit 0
}

if ! mkdir "$LOCK_PATH" 2>/dev/null; then
  printf 'duplicate claude worker lock exists: %s\n' "$LOCK_PATH" >&2
  exit 70
fi
trap cleanup EXIT
trap on_signal INT TERM

RUN_STARTED_SECONDS=$(date +%s)
RUN_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
IDLE_START_SECONDS=$RUN_STARTED_SECONDS
printf '[%s] claude worker starting worker=%s lead=%s agent=%s max_tasks=%s max_idle_seconds=%s recv_timeout=%s max_recv_errors=%s report_target=%s\n' \
  "$RUN_STARTED_AT" "$WORKER" "$LEAD" "$AGENT" "$MAX_TASKS" "$MAX_IDLE_SECONDS" "$RECV_TIMEOUT" "$MAX_RECV_ERRORS" "${AWG_REPORT_TARGET:-none}"
send_status "claude worker started: worker=${WORKER} agent=${AGENT} max_tasks=${MAX_TASKS} max_idle_seconds=${MAX_IDLE_SECONDS}"

while true; do
  now=$(date +%s)
  if (( MAX_IDLE_SECONDS > 0 && now - IDLE_START_SECONDS >= MAX_IDLE_SECONDS )); then
    STOP_REASON="idle timeout"
    exit 0
  fi

  marker=$(mktemp "${LOG_DIR}/${WORKER}.bridge-marker.XXXXXX")
  if LOG_DIR="$LOG_DIR" AGENT="$AGENT" "$BRIDGE_SCRIPT" --worker "$WORKER" --lead "$LEAD" --root "$AWG_ROOT" --timeout "$RECV_TIMEOUT" -- "$AGENT_EXECUTOR"; then
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
