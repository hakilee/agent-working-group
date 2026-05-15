#!/usr/bin/env bash
set -euo pipefail

# Category: worker-infrastructure
# Role: Main-session-independent tmux completion watcher.

usage() {
  cat <<'USAGE'
Usage: tmux-completion-watcher.sh --sessions SESSION[,SESSION...] [options]

Options:
  --sessions LIST       Comma-separated tmux session/window targets to watch.
  --interval SECONDS    Poll interval. Default: 30.
  --timeout SECONDS     Max watch duration. Default: 1800.
  --result-dir PATH     Where captured outputs and JSON events are stored.
                        Default: $AWG_ROOT/runtime/tmux-results.
  --state-id ID         Optional awg-work-state.sh work id to update.
  --keep-sessions       Do not kill watched sessions after completion.
  --completion-regex RE Pattern that marks new pane output as complete.
                        Default: AWG_TMUX_DONE(:|=)$WATCH_ID
  --allow-missing-sessions
                        Treat sessions missing at startup as already gone.
                        Off by default to catch typos and lost work.
  --allow-prompt-complete
                        Treat shell prompts/process-exit text in new output as
                        completion. Off by default to avoid false positives.
  --on-complete CMD     Optional command executed after all sessions complete.

The watcher writes durable completion evidence to result-dir and does not rely
on OpenClaw main-session cron/systemEvents. Completion is intentionally
conservative: a live session completes only when it exits/disappears or emits a
new explicit completion marker after the watcher starts.
USAGE
}

AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SESSIONS=""
INTERVAL=30
TIMEOUT=1800
RESULT_DIR="${AWG_ROOT}/runtime/tmux-results"
STATE_ID=""
KEEP_SESSIONS=0
ON_COMPLETE=""
COMPLETION_REGEX=""
ALLOW_MISSING_SESSIONS=0
ALLOW_PROMPT_COMPLETE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sessions) SESSIONS=${2:?}; shift 2 ;;
    --interval) INTERVAL=${2:?}; shift 2 ;;
    --timeout) TIMEOUT=${2:?}; shift 2 ;;
    --result-dir) RESULT_DIR=${2:?}; shift 2 ;;
    --state-id) STATE_ID=${2:?}; shift 2 ;;
    --keep-sessions) KEEP_SESSIONS=1; shift ;;
    --completion-regex) COMPLETION_REGEX=${2:?}; shift 2 ;;
    --allow-missing-sessions) ALLOW_MISSING_SESSIONS=1; shift ;;
    --allow-prompt-complete) ALLOW_PROMPT_COMPLETE=1; shift ;;
    --on-complete) ON_COMPLETE=${2:?}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$SESSIONS" ]]; then
  echo "--sessions is required" >&2
  usage >&2
  exit 2
fi

mkdir -p "$RESULT_DIR"
EVENTS_FILE="${RESULT_DIR}/events.jsonl"
STATUS_FILE="${RESULT_DIR}/status.json"
COMPLETIONS_FILE="${RESULT_DIR}/completions.log"
WATCH_ID=${WATCH_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}
COMPLETION_REGEX=${COMPLETION_REGEX:-"AWG_TMUX_DONE(:|=)${WATCH_ID}"}

safe_name() {
  printf '%s' "$1" | tr -c 'A-Za-z0-9_.-' '_'
}

json_event() {
  local event=$1 session=${2:-} status=${3:-} detail=${4:-}
  python3 - "$event" "$session" "$status" "$detail" <<'PY' >>"$EVENTS_FILE"
import json
import sys
from datetime import datetime, timezone

event, session, status, detail = sys.argv[1:]
payload = {
    "at": datetime.now(timezone.utc).isoformat(),
    "event": event,
}
if session:
    payload["session"] = session
if status:
    payload["status"] = status
if detail:
    payload["detail"] = detail
print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
PY
}

write_status() {
  local status=$1 detail=${2:-}
  local tmp
  tmp=$(mktemp "${STATUS_FILE}.XXXXXX")
  python3 - "$status" "$detail" "$SESSIONS" "$WATCH_ID" <<'PY' >"$tmp"
import json
import sys
from datetime import datetime, timezone

status, detail, sessions, watch_id = sys.argv[1:]
print(json.dumps({
    "updatedAt": datetime.now(timezone.utc).isoformat(),
    "status": status,
    "detail": detail,
    "sessions": [s for s in sessions.split(',') if s],
    "watchId": watch_id,
    "expectedCompletionMarker": f"AWG_TMUX_DONE:{watch_id}",
}, ensure_ascii=False, indent=2, sort_keys=True))
PY
  mv "$tmp" "$STATUS_FILE"
}

update_work_state() {
  local status=$1 detail=${2:-} session=${3:-}
  if [[ -z "$STATE_ID" || ! -x "${SCRIPT_DIR}/awg-work-state.sh" ]]; then
    return 0
  fi
  args=(update --id "$STATE_ID" --status "$status" --detail "$detail")
  if [[ -n "$session" ]]; then
    args+=(--tmux "$session")
  fi
  AWG_ROOT="$AWG_ROOT" "${SCRIPT_DIR}/awg-work-state.sh" "${args[@]}" >/dev/null || true
}

is_done() {
  local session=$1 baseline_file=$2
  if ! tmux has-session -t "$session" 2>/dev/null; then
    echo "gone"
    return 0
  fi
  local output baseline
  output=$(tmux capture-pane -t "$session" -p -S - 2>/dev/null || true)
  baseline=$(cat "$baseline_file" 2>/dev/null || true)
  if [[ -n "$COMPLETION_REGEX" ]] \
    && printf '%s\n' "$output" | grep -qE "$COMPLETION_REGEX" \
    && ! printf '%s\n' "$baseline" | grep -qE "$COMPLETION_REGEX"; then
    echo "done"
    return 0
  fi
  if [[ "$ALLOW_PROMPT_COMPLETE" -eq 1 ]] \
    && printf '%s\n' "$output" | grep -qE '(^|[[:space:]])Process exited([[:space:]]|$)|(%|\$|#)[[:space:]]*$' \
    && ! printf '%s\n' "$baseline" | grep -qE '(^|[[:space:]])Process exited([[:space:]]|$)|(%|\$|#)[[:space:]]*$'; then
    echo "done"
    return 0
  fi
  echo "running"
}

elapsed=0
COMPLETED_DIR="${RESULT_DIR}/completed"
BASELINE_DIR="${RESULT_DIR}/baselines/${WATCH_ID}"
mkdir -p "$COMPLETED_DIR" "$BASELINE_DIR"
IFS=',' read -r -a initial_session_list <<< "$SESSIONS"
missing_sessions=()
for raw_session in "${initial_session_list[@]}"; do
  session=${raw_session//[[:space:]]/}
  [[ -z "$session" ]] && continue
  safe_session=$(safe_name "$session")
  baseline_file="${BASELINE_DIR}/${safe_session}.pane"
  if tmux has-session -t "$session" 2>/dev/null; then
    tmux capture-pane -t "$session" -p -S - >"$baseline_file" 2>/dev/null || true
  else
    : >"$baseline_file"
    missing_sessions+=("$session")
  fi
done
if [[ "${#missing_sessions[@]}" -gt 0 && "$ALLOW_MISSING_SESSIONS" -ne 1 ]]; then
  detail="missing sessions at startup: ${missing_sessions[*]}"
  printf '[%s] %s\n' "$(date -Iseconds)" "$detail" >&2
  json_event watcher-start-failed "" error "$detail"
  write_status error "$detail"
  update_work_state tmux-error "$detail"
  exit 2
fi
json_event watcher-start "" running "watchId=${WATCH_ID} interval=${INTERVAL}s timeout=${TIMEOUT}s"
write_status running "watching"
update_work_state tmux-watching "watching sessions: ${SESSIONS}"
printf '[%s] Watching sessions: %s (watchId=%s interval=%ss timeout=%ss)\n' "$(date -Iseconds)" "$SESSIONS" "$WATCH_ID" "$INTERVAL" "$TIMEOUT"

while [[ "$elapsed" -lt "$TIMEOUT" ]]; do
  IFS=',' read -r -a session_list <<< "$SESSIONS"
  all_done=true

  for raw_session in "${session_list[@]}"; do
    session=${raw_session//[[:space:]]/}
    [[ -z "$session" ]] && continue
    safe_session=$(safe_name "$session")
    marker="${COMPLETED_DIR}/${safe_session}.${WATCH_ID}.done"
    baseline_file="${BASELINE_DIR}/${safe_session}.pane"
    if [[ -f "$marker" ]]; then
      continue
    fi

    status=$(is_done "$session" "$baseline_file")
    if [[ "$status" == "done" || "$status" == "gone" ]]; then
      printf '[%s] Session %s completed (status=%s)\n' "$(date -Iseconds)" "$session" "$status"
      if [[ "$status" == "done" ]]; then
        tmux capture-pane -t "$session" -p -S - >"${RESULT_DIR}/${safe_session}-output.txt" 2>/dev/null || true
      fi
      if [[ "$KEEP_SESSIONS" -ne 1 ]]; then
        tmux kill-session -t "$session" 2>/dev/null || true
      fi
      : >"$marker"
      printf '%s: %s at %s\n' "$session" "$status" "$(date -Iseconds)" >>"$COMPLETIONS_FILE"
      json_event session-complete "$session" "$status" "captured=${RESULT_DIR}/${safe_session}-output.txt"
      update_work_state tmux-session-complete "${session}: ${status}" "$session"
    else
      all_done=false
    fi
  done

  if [[ "$all_done" == true ]]; then
    write_status complete "all sessions completed"
    json_event watcher-complete "" complete "all sessions completed"
    update_work_state tmux-complete "all sessions completed"
    if [[ -n "$ON_COMPLETE" ]]; then
      bash -lc "$ON_COMPLETE"
    fi
    exit 0
  fi

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
done

write_status timeout "timeout after ${TIMEOUT}s"
json_event watcher-timeout "" timeout "timeout after ${TIMEOUT}s"
update_work_state tmux-timeout "timeout after ${TIMEOUT}s"
exit 1
