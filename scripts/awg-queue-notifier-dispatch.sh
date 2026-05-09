#!/usr/bin/env bash
set -euo pipefail

AWG_ROOT=${AWG_ROOT:-.agent-working-group}
NOTIFIER=${NOTIFIER:-scripts/awg-queue-notifier.sh}
STATE_FILE=${STATE_FILE:-"${AWG_ROOT}/queue-notifier-state.json"}
ROLE_MAP=""
FORMAT=json
RECORD=0
ROLES=()

usage() {
  cat <<'USAGE'
Usage: awg-queue-notifier-dispatch.sh --role ROLE [--role ROLE ...] [options]

Build provider-neutral delivery payloads from read-only queue notifier output.
This script does not send messages to external providers. It is a dry-run
adapter boundary for schedulers or provider-specific wrappers.

Options:
  --role ROLE           Queue role to inspect. Repeat for multiple roles.
  --role-map PATH       Optional JSON map: {"roles":{"role":{"destination":"..."}}}.
  --state-file PATH     Notifier state file. Default: $AWG_ROOT/queue-notifier-state.json.
  --format json|text    Output format. Default: json.
  --record              Allow notifier state recording during this run. Default: no-record.
  --help                Show this help.

Default no-record mode prevents marking alerts as notified before a downstream
adapter confirms delivery. Use --record only in an operator-approved wrapper
that can tolerate the chosen delivery semantics.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --role)
      [ "$#" -ge 2 ] || { echo "missing value for --role" >&2; exit 64; }
      ROLES+=("$2")
      shift 2
      ;;
    --role-map)
      [ "$#" -ge 2 ] || { echo "missing value for --role-map" >&2; exit 64; }
      ROLE_MAP=$2
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
    --record)
      RECORD=1
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
  json|text) ;;
  *) echo "--format must be json or text" >&2; exit 64 ;;
esac

NOTIFIER_ARGS=(--format json --state-file "$STATE_FILE")
if [ "$RECORD" -eq 0 ]; then
  NOTIFIER_ARGS+=(--no-record)
fi
for role in "${ROLES[@]}"; do
  NOTIFIER_ARGS+=(--role "$role")
done

NOTIFIER_JSON=$("$NOTIFIER" "${NOTIFIER_ARGS[@]}")

NOTIFIER_JSON="$NOTIFIER_JSON" python3 - "$FORMAT" "$ROLE_MAP" <<'PY'
import json
import os
import sys
from pathlib import Path

fmt = sys.argv[1]
role_map_path = sys.argv[2]
notifier_payload = json.loads(os.environ.get("NOTIFIER_JSON", "{}"))

role_map = {"roles": {}}
if role_map_path:
    try:
        loaded = json.loads(Path(role_map_path).read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"invalid role map JSON: {exc}", file=sys.stderr)
        sys.exit(65)
    if not isinstance(loaded, dict) or not isinstance(loaded.get("roles"), dict):
        print("role map must be an object with a roles object", file=sys.stderr)
        sys.exit(65)
    role_map = loaded

notifications = notifier_payload.get("notifications")
if not isinstance(notifications, list):
    print("notifier output must include a notifications list", file=sys.stderr)
    sys.exit(65)

deliveries = []
for note in notifications:
    role = str(note.get("role", ""))
    mapped = role_map["roles"].get(role, {})
    if mapped is None:
        mapped = {}
    if not isinstance(mapped, dict):
        print(f"role map entry for {role} must be an object", file=sys.stderr)
        sys.exit(65)
    destination = mapped.get("destination", role)
    label = mapped.get("label", role)
    work_id = note.get("workId")
    parts = [
        "AWG queue notification",
        f"role={role}",
        f"id={note.get('id')}",
        f"kind={note.get('kind')}",
        f"from={note.get('from')}",
    ]
    if work_id:
        parts.append(f"workId={work_id}")
    summary = note.get("summary") or ""
    if summary:
        parts.append(f"summary={summary}")
    deliveries.append(
        {
            "destination": destination,
            "label": label,
            "role": role,
            "messageId": note.get("id"),
            "workId": work_id,
            "summary": summary,
            "text": " | ".join(parts),
        }
    )

if fmt == "json":
    print(json.dumps({"deliveries": deliveries}, ensure_ascii=False, indent=2, sort_keys=True))
else:
    for delivery in deliveries:
        print(f"delivery destination={delivery['destination']} messageId={delivery['messageId']} text={delivery['text']}")
PY
