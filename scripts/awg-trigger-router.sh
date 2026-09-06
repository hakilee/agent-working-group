#!/usr/bin/env bash
set -euo pipefail

# Category: queue-operation
# Role: One-shot trigger router — schema-field-only wake routing for AWG queues (B' Stage 1).
#
# Spec: artifacts/specs-draft/20260906-bprime-stage1-trigger-worker.md (approved 2026-09-06)
#
# Principles (enforced by design):
#   - Read-only wrt queues: uses `awg peek` only. Never recv/ack/move/edit queue JSON.
#   - Routing decided ONLY by schema fields (recipient role + kind). Body content is
#     never parsed for routing decisions (summary lines for wakes are first-line previews,
#     not routing inputs).
#   - Idempotent: message-id state dedup (wake once per message), ensure-running worker
#     spawn (no-op if session/lock exists).
#   - No recursion: worker-emitted kinds (status/note/answer to lead) only wake lead when
#     kind is answer|blocker; status/note/question never wake anyone. Observer queue is
#     never woken.
#
# Routing table (Stage 1, observed patterns only; anything else = no-wake, watchdog catches):
#   worker   inbox, any kind          -> ensure anonymous tmux worker running
#   lead     inbox, kind answer|blocker -> wake lead (systemEvent to main session)
#   reviewer inbox, kind instruction   -> wake reviewer (Discord mention)
#
# Usage:
#   scripts/awg-trigger-router.sh [--shadow] [--dry-run]
#
# Environment:
#   AWG_ROOT       AWG root (default: repo .agent-working-group)
#   AWG_CLI        CLI path (default: repo .venv/bin/awg)
#   WORKER         worker role name (default: worker)
#   WORKER_SESSION tmux session name for the worker supervisor (default: awg-worker-<WORKER>)
#   LEAD_WAKE      1 = send lead wake (default 1)
#   REVIEWER_WAKE  1 = send reviewer wake (default 1)
#   WORKER_SPAWN   1 = ensure worker running (default 1)
#   MAX_TASKS      passed to worker supervisor (default 25; shadow guidance: 1)
#   MAX_IDLE_SECONDS  passed to worker supervisor (default 1800)
#   DISCORD_TARGET wake destination (default channel:1501895951231750174)
#   MATDORI_MENTION  reviewer mention token (default <@1498870093445201975>)
#   OC_BIN          openclaw binary (default: PATH lookup; note OPENCLAW_CLI=1 is a gateway env marker, not a path)
#
# Modes:
#   --shadow   log all decisions and would-be deliveries; suppress external sends/spawns.
#              Still records state dedup so shadow behavior matches production logic.
#   --dry-run  like --shadow but does not record state (pure inspection).

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
AWG_ROOT=${AWG_ROOT:-"${REPO_ROOT}/.agent-working-group"}
AWG_CLI=${AWG_CLI:-"${REPO_ROOT}/.venv/bin/awg"}
OC_BIN=${OC_BIN:-$(command -v openclaw || echo openclaw)}
WORKER=${WORKER:-worker}
WORKER_SESSION=${WORKER_SESSION:-"awg-worker-${WORKER}"}
WORKER_SUPERVISOR="${SCRIPT_DIR}/awg-worker-tmux.sh"
LEAD_WAKE=${LEAD_WAKE:-1}
REVIEWER_WAKE=${REVIEWER_WAKE:-1}
WORKER_SPAWN=${WORKER_SPAWN:-1}
MAX_TASKS=${MAX_TASKS:-25}
MAX_IDLE_SECONDS=${MAX_IDLE_SECONDS:-1800}
DISCORD_TARGET=${DISCORD_TARGET:-"channel:1501895951231750174"}
MATDORI_MENTION=${MATDORI_MENTION:-"<@1498870093445201975>"}
STATE_FILE=${STATE_FILE:-"${AWG_ROOT}/trigger-router-state.json"}
LOG_FILE=${LOG_FILE:-"${AWG_ROOT}/log/trigger-router.log"}
LOCK_DIR="${AWG_ROOT}/tmp/locks/trigger-router.lockdir"
LOCK_STALE_SECONDS=${LOCK_STALE_SECONDS:-300}

MODE=run
case "${1:-}" in
  --shadow) MODE=shadow ;;
  --dry-run) MODE=dry-run ;;
  --help|-h)
    sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "") ;;
  *) echo "unknown argument: $1 (use --shadow or --dry-run)" >&2; exit 64 ;;
esac

mkdir -p "${AWG_ROOT}/tmp/locks" "${AWG_ROOT}/log"

log() {
  printf '[%s] router mode=%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$MODE" "$*" | tee -a "$LOG_FILE" >&2
}

# --- single-instance lock (mkdir lockdir + pid + staleness; no flock on macOS) ---
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  owner_pid=$(cat "${LOCK_DIR}/pid" 2>/dev/null || echo "")
  lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0) ))
  if [[ -n "$owner_pid" ]] && kill -0 "$owner_pid" 2>/dev/null; then
    log "another router instance is running (pid=${owner_pid}); exiting without action"
    exit 0
  fi
  if (( lock_age < LOCK_STALE_SECONDS )); then
    log "lock is fresh (age=${lock_age}s) but owner pid is gone; refusing to steal early; exiting"
    exit 0
  fi
  log "stealing stale lock (age=${lock_age}s, pid=${owner_pid:-unknown})"
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR" || { log "cannot acquire lock after steal"; exit 75; }
fi
echo $$ > "${LOCK_DIR}/pid"

# --- evaluate routing decisions (python does schema-field matching + state dedup) ---
route_summary=$(mktemp)
cleanup() { rm -f "$route_summary"; rm -rf "$LOCK_DIR"; }
trap cleanup EXIT

for role in lead worker reviewer; do
  inbox_json=$("$AWG_CLI" --root "$AWG_ROOT" peek --as "$role" 2>/dev/null || echo "[]")
  printf '%s' "$inbox_json" > "/tmp/awg-router-inbox-${role}.$$"
done

python3 - "$STATE_FILE" "$MODE" "/tmp/awg-router-inbox-lead.$$" "/tmp/awg-router-inbox-worker.$$" "/tmp/awg-router-inbox-reviewer.$$" > "$route_summary" <<'PY'
import json, sys, time
from pathlib import Path

state_path, mode, lead_f, worker_f, reviewer_f = sys.argv[1:6]

state = {"woken": {}}
p = Path(state_path)
if p.exists():
    try:
        loaded = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(loaded, dict) and isinstance(loaded.get("woken"), dict):
            state = loaded
    except json.JSONDecodeError:
        state = {"woken": {}}

now_ms = int(time.time() * 1000)

def load(f):
    try:
        data = json.loads(Path(f).read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []

def first_line(body):
    return next((ln.strip() for ln in str(body or "").splitlines() if ln.strip()), "")[:160]

decisions = []

# Routing table — schema fields only. Body is preview-only, never a routing input.
lead_msgs = load(lead_f)
worker_msgs = load(worker_f)
reviewer_msgs = load(reviewer_f)

# 1) worker queue: any pending -> ensure worker
if worker_msgs:
    decisions.append({"action": "ensure_worker", "reason": "worker inbox pending", "count": len(worker_msgs)})

# 2) lead queue: kind answer|blocker -> wake lead
woken_lead = state["woken"].setdefault("lead", {})
for m in lead_msgs:
    mid = str(m.get("id", ""))
    kind = str(m.get("kind", ""))
    if kind in ("answer", "blocker") and mid and mid not in woken_lead:
        decisions.append({"action": "wake_lead", "id": mid, "kind": kind, "preview": first_line(m.get("body"))})
        if mode != "dry-run":
            woken_lead[mid] = now_ms

# 3) reviewer queue: kind instruction -> wake reviewer
woken_reviewer = state["woken"].setdefault("reviewer", {})
for m in reviewer_msgs:
    mid = str(m.get("id", ""))
    kind = str(m.get("kind", ""))
    if kind == "instruction" and mid and mid not in woken_reviewer:
        decisions.append({"action": "wake_reviewer", "id": mid, "kind": kind, "preview": first_line(m.get("body"))})
        if mode != "dry-run":
            woken_reviewer[mid] = now_ms

# 4) everything else: explicitly no-wake (observed-patterns-only Stage 1)
skipped = []
for m in lead_msgs:
    if str(m.get("kind", "")) not in ("answer", "blocker"):
        skipped.append({"role": "lead", "id": m.get("id"), "kind": m.get("kind"), "rule": "no-wake (kind not answer|blocker)"})
for m in reviewer_msgs:
    if str(m.get("kind", "")) != "instruction":
        skipped.append({"role": "reviewer", "id": m.get("id"), "kind": m.get("kind"), "rule": "no-wake (kind not instruction)"})

out = {"decisions": decisions, "skipped": skipped, "state_updated": mode != "dry-run" and bool(decisions)}
if mode != "dry-run":
    p.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(out, ensure_ascii=False))
PY

rm -f /tmp/awg-router-inbox-{lead,worker,reviewer}.$$

# --- act on decisions ---
ensure_worker_running() {
  if tmux has-session -t "$WORKER_SESSION" 2>/dev/null; then
    log "worker already running (session=${WORKER_SESSION}); no spawn"
    return 0
  fi
  if [[ -d "${AWG_ROOT}/tmp/locks/${WORKER}-worker-loop.lockdir" ]]; then
    log "worker lock exists but no tmux session; NOT spawning (operator should inspect: awg-worker-tmux.sh requeue-stale / status)"
    return 0
  fi
  if [[ "$MODE" == "run" && "$WORKER_SPAWN" == "1" ]]; then
    if AWG_ROOT="$AWG_ROOT" WORKER="$WORKER" MAX_TASKS="$MAX_TASKS" MAX_IDLE_SECONDS="$MAX_IDLE_SECONDS" \
       bash "$WORKER_SUPERVISOR" start >>"$LOG_FILE" 2>&1; then
      log "spawned worker session=${WORKER_SESSION} max_tasks=${MAX_TASKS} max_idle=${MAX_IDLE_SECONDS}"
    else
      rc=$?
      if [[ "$rc" == 69 || "$rc" == 71 ]]; then
        log "worker spawn refused (rc=${rc}: session/lock exists) — treated as already-running"
      else
        log "worker spawn FAILED rc=${rc}"
      fi
    fi
  else
    log "SHADOW would spawn worker session=${WORKER_SESSION} max_tasks=${MAX_TASKS} max_idle=${MAX_IDLE_SECONDS}"
  fi
}

wake_lead() {
  local id=$1 kind=$2 preview=$3
  local text="[AWG trigger-router] lead wake: ${kind} ${id} — ${preview}"
  if [[ "$MODE" == "run" && "$LEAD_WAKE" == "1" ]]; then
    if "$OC_BIN" cron add --name "awg-lead-wake-$(date +%Y%m%d%H%M%S)" \
        --at "$(date -u -v+5S +%Y-%m-%dT%H:%M:%SZ)" \
        --system-event "$text" --session main --delete-after-run \
        >>"$LOG_FILE" 2>&1; then
      log "lead wake scheduled (systemEvent -> main): ${text}"
    else
      log "lead wake scheduling FAILED"
    fi
  else
    log "SHADOW would wake lead (systemEvent -> main): ${text}"
  fi
}

wake_reviewer() {
  local id=$1 preview=$2
  local msg="${MATDORI_MENTION} [AWG trigger-router] reviewer wake: instruction ${id} — ${preview}"
  if [[ "$MODE" == "run" && "$REVIEWER_WAKE" == "1" ]]; then
    if "$OC_BIN" message send --channel discord --target "$DISCORD_TARGET" --message "$msg" >>"$LOG_FILE" 2>&1; then
      log "reviewer wake sent (discord ${DISCORD_TARGET}): ${msg}"
    else
      log "reviewer wake send FAILED"
    fi
  else
    log "SHADOW would wake reviewer (discord ${DISCORD_TARGET}): ${msg}"
  fi
}

decision_count=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))['decisions']))" "$route_summary")
log "decisions=${decision_count}"

python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
for x in d['decisions']:
    print(json.dumps(x, ensure_ascii=False))
for s in d['skipped']:
    print(json.dumps(s, ensure_ascii=False))
" "$route_summary" | while IFS= read -r line; do
  action=$(printf '%s' "$line" | python3 -c "import json,sys; print(json.load(sys.stdin).get('action',''))" 2>/dev/null || echo "")
  case "$action" in
    ensure_worker) ensure_worker_running ;;
    wake_lead)
      id=$(printf '%s' "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
      kind=$(printf '%s' "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['kind'])")
      preview=$(printf '%s' "$line" | python3 -c "import json,sys; print(json.load(sys.stdin).get('preview',''))")
      wake_lead "$id" "$kind" "$preview" ;;
    wake_reviewer)
      id=$(printf '%s' "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
      preview=$(printf '%s' "$line" | python3 -c "import json,sys; print(json.load(sys.stdin).get('preview',''))")
      wake_reviewer "$id" "$preview" ;;
    *) log "no-wake: $line" ;;
  esac
done

log "router pass complete"
exit 0
