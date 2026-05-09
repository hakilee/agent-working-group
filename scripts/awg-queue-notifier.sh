#!/usr/bin/env bash
set -euo pipefail

AWG_CLI=${AWG_CLI:-awg}
AWG_ROOT=${AWG_ROOT:-.agent-working-group}
STATE_FILE=${STATE_FILE:-"${AWG_ROOT}/queue-notifier-state.json"}
FORMAT=text
RECORD=1
ROLES=()

usage() {
  cat <<'USAGE'
Usage: awg-queue-notifier.sh --role ROLE [--role ROLE ...] [options]

Read-only pending queue notifier helper. It emits not-yet-notified inbox items
and records emitted message ids in a local state file for duplicate suppression.

Options:
  --role ROLE           Queue role to inspect. Repeat for multiple roles.
  --state-file PATH     Notification state file. Default: $AWG_ROOT/queue-notifier-state.json.
  --format text|json    Output format. Default: text.
  --no-record           Emit without updating the notification state file.
  --help                Show this help.

This helper must not run recv, ack, retry, nack, prune, requeue-stale, or edit
queue JSON files. It only reads pending inbox items through peek.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --role)
      [ "$#" -ge 2 ] || { echo "missing value for --role" >&2; exit 64; }
      ROLES+=("$2")
      shift 2
      ;;
    --state-file)
      [ "$#" -ge 2 ] || { echo "missing value for --state-file" >&2; exit 64; }
      STATE_FILE=$2
      shift 2
      ;;
    --format)
      [ "$#" -ge 2 ] || { echo "missing value for --format" >&2; exit 64; }
      FORMAT=$2
      shift 2
      ;;
    --no-record)
      RECORD=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [ "${#ROLES[@]}" -eq 0 ]; then
  echo "at least one --role is required" >&2
  exit 64
fi

case "$FORMAT" in
  text|json) ;;
  *) echo "--format must be text or json" >&2; exit 64 ;;
esac

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/awg-queue-notifier.XXXXXX")
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ROLE_FILES=()
for role in "${ROLES[@]}"; do
  case "$role" in
    ""|*/*|*..*) echo "unsafe role: $role" >&2; exit 64 ;;
  esac
  out="$TMP_DIR/${role}.json"
  "$AWG_CLI" --root "$AWG_ROOT" peek --as "$role" > "$out"
  ROLE_FILES+=("$role=$out")
done

python3 - "$STATE_FILE" "$FORMAT" "$RECORD" "${ROLE_FILES[@]}" <<'PY'
import json
import os
import sys
from pathlib import Path

state_path = Path(sys.argv[1])
fmt = sys.argv[2]
record = sys.argv[3] == "1"
role_files = sys.argv[4:]

state = {"notified": {}}
if state_path.exists():
    try:
        loaded = json.loads(state_path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict) and isinstance(loaded.get("notified"), dict):
            state = loaded
    except json.JSONDecodeError:
        print(f"invalid notifier state file: {state_path}", file=sys.stderr)
        sys.exit(65)

notifications = []
for item in role_files:
    role, file_name = item.split("=", 1)
    messages = json.loads(Path(file_name).read_text(encoding="utf-8"))
    if not isinstance(messages, list):
        print(f"peek for {role} did not return a list", file=sys.stderr)
        sys.exit(65)
    notified_for_role = state.setdefault("notified", {}).setdefault(role, {})
    for message in messages:
        message_id = str(message.get("id", ""))
        if not message_id or message_id in notified_for_role:
            continue
        body = str(message.get("body", ""))
        first_line = next((line.strip() for line in body.splitlines() if line.strip()), "")
        refs = message.get("refs") if isinstance(message.get("refs"), dict) else {}
        note = {
            "role": role,
            "id": message_id,
            "kind": message.get("kind"),
            "from": message.get("from"),
            "to": message.get("to"),
            "createdAt": message.get("createdAt"),
            "workId": refs.get("workId"),
            "summary": first_line[:240],
        }
        notifications.append(note)
        if record:
            notified_for_role[message_id] = {
                "createdAt": message.get("createdAt"),
                "workId": refs.get("workId"),
            }

if record and notifications:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = state_path.with_name(f".{state_path.name}.{os.getpid()}.tmp")
    tmp_path.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp_path, state_path)

if fmt == "json":
    print(json.dumps({"notifications": notifications}, ensure_ascii=False, indent=2, sort_keys=True))
else:
    for note in notifications:
        work = f" workId={note['workId']}" if note.get("workId") else ""
        print(
            f"queue_notification role={note['role']} id={note['id']} kind={note.get('kind')} "
            f"from={note.get('from')} createdAt={note.get('createdAt')}{work} summary={note.get('summary', '')}"
        )
PY
