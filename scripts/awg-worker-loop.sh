#!/usr/bin/env bash
set -euo pipefail

AWG_CLI=${AWG_CLI:-awg}
AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
WORKER=${WORKER:-worker}
LEAD=${LEAD:-lead}
LOG_DIR=${LOG_DIR:-"${AWG_ROOT}/log/worker-sessions"}
RECV_TIMEOUT=${RECV_TIMEOUT:-5}
MAX_TASKS=${MAX_TASKS:-25}
MAX_IDLE_SECONDS=${MAX_IDLE_SECONDS:-1800}
MAX_RECV_ERRORS=${MAX_RECV_ERRORS:-3}
REPORT_STATUS=${REPORT_STATUS:-1}

LOCK_PATH="${AWG_ROOT}/tmp/locks/${WORKER}-worker-loop.lockdir"
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
  printf '[%s] worker loop stopping worker=%s tasks=%s reason=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$WORKER" "$TASKS" "$STOP_REASON"
  send_status "worker stopped: worker=${WORKER} tasks=${TASKS} reason=${STOP_REASON}"
  exit "$code"
}

on_signal() {
  STOP_REASON="signal"
  exit 0
}

if ! mkdir "$LOCK_PATH" 2>/dev/null; then
  printf 'duplicate worker lock exists: %s\n' "$LOCK_PATH" >&2
  exit 70
fi
trap cleanup EXIT
trap on_signal INT TERM

IDLE_START_SECONDS=$(date +%s)
printf '[%s] worker loop starting worker=%s lead=%s max_tasks=%s max_idle_seconds=%s recv_timeout=%s max_recv_errors=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$WORKER" "$LEAD" "$MAX_TASKS" "$MAX_IDLE_SECONDS" "$RECV_TIMEOUT" "$MAX_RECV_ERRORS"
send_status "worker started: worker=${WORKER} max_tasks=${MAX_TASKS} max_idle_seconds=${MAX_IDLE_SECONDS}"

while true; do
  now=$(date +%s)
  if (( MAX_IDLE_SECONDS > 0 && now - IDLE_START_SECONDS >= MAX_IDLE_SECONDS )); then
    STOP_REASON="idle timeout"
    exit 0
  fi

  tmp_base=$(mktemp "${LOG_DIR}/${WORKER}.msg.XXXXXX")
  tmp_msg="${tmp_base}.json"
  mv "$tmp_base" "$tmp_msg"

  if "$AWG_CLI" --root "$AWG_ROOT" recv --as "$WORKER" --require-ack --timeout "$RECV_TIMEOUT" >"$tmp_msg" 2>"${tmp_msg}.err"; then
    RECV_ERRORS=0
    IDLE_START_SECONDS=$(date +%s)
    id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$tmp_msg")
    kind=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("kind", ""))' "$tmp_msg")
    body=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("body", ""))' "$tmp_msg")
    TASKS=$((TASKS + 1))
    printf '[%s] received task=%s id=%s kind=%s body=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TASKS" "$id" "$kind" "$body"
    if [[ "$kind" == "instruction" ]]; then
      printf '[%s] warning: instruction received by queue runner; acknowledging without AI execution\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    fi
    "$AWG_CLI" --root "$AWG_ROOT" ack --as "$WORKER" --id "$id" >/dev/null
    printf '[%s] acked id=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$id"
    if (( MAX_TASKS > 0 && TASKS >= MAX_TASKS )); then
      STOP_REASON="max tasks"
      exit 0
    fi
  else
    if grep -qi 'timeout: no messages' "${tmp_msg}.err"; then
      rm -f "$tmp_msg" "${tmp_msg}.err"
      continue
    fi
    RECV_ERRORS=$((RECV_ERRORS + 1))
    printf '[%s] recv error count=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$RECV_ERRORS" >&2
    cat "${tmp_msg}.err" >&2 || true
    if (( MAX_RECV_ERRORS > 0 && RECV_ERRORS >= MAX_RECV_ERRORS )); then
      STOP_REASON="recv errors"
      exit 1
    fi
  fi
done
