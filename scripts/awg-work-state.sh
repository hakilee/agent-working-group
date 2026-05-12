#!/usr/bin/env bash
set -euo pipefail

# Category: runtime-state
# Role: Persist active AWG work state outside any one OpenClaw session.

AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
STATE_DIR=${STATE_DIR:-"${AWG_ROOT}/runtime/work-state"}
ACTIVE_FILE=${ACTIVE_FILE:-"${STATE_DIR}/active.json"}
EVENTS_FILE=${EVENTS_FILE:-"${STATE_DIR}/events.jsonl"}

usage() {
  cat <<'USAGE'
Usage: awg-work-state.sh <start|update|finish|report> [options]

Commands:
  start   --id ID --title TEXT [--branch NAME] [--repo OWNER/REPO] [--channel TARGET]
  update  --id ID --status TEXT [--detail TEXT] [--tmux SESSION] [--pr URL]
  finish  --id ID --status TEXT [--detail TEXT] [--pr URL]
  report  [--id ID]

Persists active work state under $AWG_ROOT/runtime/work-state so compaction or
main-session loss does not erase the current task, tmux sessions, PR URL, or
latest status.
USAGE
}

cmd=${1:-}
if [[ -z "$cmd" || "$cmd" == "-h" || "$cmd" == "--help" ]]; then
  usage
  exit 0
fi
shift || true

mkdir -p "$STATE_DIR"

python3 - "$cmd" "$ACTIVE_FILE" "$EVENTS_FILE" "$@" <<'PY'
import fcntl
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

cmd, active_path, events_path, *argv = sys.argv[1:]
active = Path(active_path)
events = Path(events_path)

args = {}
i = 0
while i < len(argv):
    key = argv[i]
    if not key.startswith("--"):
        raise SystemExit(f"unknown argument: {key}")
    if i + 1 >= len(argv):
        raise SystemExit(f"missing value for {key}")
    args[key[2:].replace("-", "_")] = argv[i + 1]
    i += 2

now = datetime.now(timezone.utc).isoformat()

def load_active():
    if not active.exists():
        return {}
    try:
        loaded = json.loads(active.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        backup = active.with_suffix(f".corrupt-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}")
        try:
            backup.write_text(active.read_text(encoding="utf-8"), encoding="utf-8")
        except OSError:
            backup = None
        detail = f"corrupt active work state: {active}: {exc}"
        if backup:
            detail += f"; backup={backup}"
        raise SystemExit(detail)
    if not isinstance(loaded, dict):
        raise SystemExit(f"active work state must be a JSON object: {active}")
    return loaded

def write_active(data):
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=active.parent, prefix="active.", suffix=".tmp", delete=False) as fh:
        tmp_name = fh.name
        fh.write(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    os.replace(tmp_name, active)

def append_event(event):
    with events.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")

work_id = args.get("id")
if cmd in {"start", "update", "finish"} and not work_id:
    raise SystemExit("--id is required")

lock_path = active.parent / ".active.lock"
with lock_path.open("a+", encoding="utf-8") as lock_fh:
    fcntl.flock(lock_fh.fileno(), fcntl.LOCK_EX)
    state = load_active()

    if cmd == "start":
        if not args.get("title"):
            raise SystemExit("--title is required")
        entry = {
            "id": work_id,
            "title": args["title"],
            "status": "started",
            "branch": args.get("branch"),
            "repo": args.get("repo"),
            "channel": args.get("channel"),
            "tmuxSessions": [],
            "pr": args.get("pr"),
            "detail": args.get("detail"),
            "startedAt": now,
            "updatedAt": now,
        }
        state[work_id] = {k: v for k, v in entry.items() if v not in (None, "")}
    elif cmd == "update":
        if work_id not in state:
            state[work_id] = {"id": work_id, "startedAt": now}
        if not args.get("status"):
            raise SystemExit("--status is required")
        state[work_id]["status"] = args["status"]
        state[work_id]["updatedAt"] = now
        for key in ("detail", "pr", "branch", "repo", "channel"):
            if args.get(key):
                state[work_id][key] = args[key]
        if args.get("tmux"):
            sessions = state[work_id].setdefault("tmuxSessions", [])
            if args["tmux"] not in sessions:
                sessions.append(args["tmux"])
    elif cmd == "finish":
        if work_id not in state:
            state[work_id] = {"id": work_id, "startedAt": now}
        if not args.get("status"):
            raise SystemExit("--status is required")
        state[work_id]["status"] = args["status"]
        state[work_id]["finishedAt"] = now
        state[work_id]["updatedAt"] = now
        for key in ("detail", "pr"):
            if args.get(key):
                state[work_id][key] = args[key]
    elif cmd == "report":
        if work_id:
            print(json.dumps(state.get(work_id, {}), ensure_ascii=False, indent=2, sort_keys=True))
        else:
            print(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True))
        raise SystemExit(0)
    else:
        raise SystemExit(f"unknown command: {cmd}")

    write_active(state)
    event = {"event": cmd, "id": work_id, "at": now, **{k: v for k, v in args.items() if v}}
    append_event(event)
    print(json.dumps(state[work_id], ensure_ascii=False, sort_keys=True))
PY
