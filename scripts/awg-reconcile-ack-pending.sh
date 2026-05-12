#!/usr/bin/env bash
set -euo pipefail

# Category: queue-operation
# Role: Evidence-gated wrapper for acknowledging one reviewed inbox item.

usage() {
  cat <<'USAGE'
Usage: awg-reconcile-ack-pending.sh --role <role> --id <message-id> --evidence <ref> --decision <text> [--operator <name>] [--audit-dir <dir>] [--dry-run]

Acknowledge one reviewed inbox item with drift checks and an audit record.
This is for reconciliation after a human/operator has evidence that the item is
completed or superseded. It is not a worker loop and it never calls recv.

Environment:
  AWG_ROOT   queue root (default: .agent-working-group)
  AWG_CLI    AWG executable path/name (default: awg, fallback: python3 -m agent_working_group.cli)
USAGE
}

ROLE=""
MESSAGE_ID=""
EVIDENCE=""
DECISION=""
OPERATOR=${USER:-operator}
AUDIT_DIR=""
DRY_RUN=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --role) ROLE=${2:-}; shift 2 ;;
    --id) MESSAGE_ID=${2:-}; shift 2 ;;
    --evidence) EVIDENCE=${2:-}; shift 2 ;;
    --decision) DECISION=${2:-}; shift 2 ;;
    --operator) OPERATOR=${2:-}; shift 2 ;;
    --audit-dir) AUDIT_DIR=${2:-}; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ -z "$ROLE" ] || [ -z "$MESSAGE_ID" ] || [ -z "$EVIDENCE" ] || [ -z "$DECISION" ]; then
  echo "error: --role, --id, --evidence, and --decision are required" >&2
  usage >&2
  exit 2
fi

repo_root=$(cd "$(dirname "$0")/.." && pwd)
AWG_ROOT=${AWG_ROOT:-.agent-working-group}
if [ -z "$AUDIT_DIR" ]; then
  AUDIT_DIR="$AWG_ROOT/audits/queue-reconciliation"
fi

if [ -n "${AWG_CLI:-}" ]; then
  cli=("$AWG_CLI")
elif command -v awg >/dev/null 2>&1; then
  cli=(awg)
else
  cli=(python3 -m agent_working_group.cli)
  if [ -z "${PYTHONPATH:-}" ]; then
    export PYTHONPATH="$repo_root/src"
  else
    export PYTHONPATH="$repo_root/src:$PYTHONPATH"
  fi
fi

run_awg() {
  "${cli[@]}" --root "$AWG_ROOT" "$@"
}

tmp=$(mktemp)
meta=$(mktemp)
cleanup() { rm -f "$tmp" "$meta"; }
trap cleanup EXIT

run_awg peek --as "$ROLE" > "$tmp"
python3 - "$MESSAGE_ID" "$tmp" "$meta" <<'PY'
import json
import sys

message_id, source, target = sys.argv[1:]
messages = json.load(open(source, encoding="utf-8"))
matches = [message for message in messages if message.get("id") == message_id]
if not matches:
    raise SystemExit(f"message not found in inbox: {message_id}")
if len(matches) > 1:
    raise SystemExit(f"multiple inbox messages match id: {message_id}")
message = matches[0]
required = ["kind", "from", "to", "createdAt"]
missing = [field for field in required if not message.get(field)]
if missing:
    raise SystemExit(f"message missing required metadata for drift check: {', '.join(missing)}")
json.dump({field: message[field] for field in required}, open(target, "w", encoding="utf-8"))
PY

kind=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["kind"])' "$meta")
from=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["from"])' "$meta")
to=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["to"])' "$meta")
created_at=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["createdAt"])' "$meta")

stamp=$(date -u +%Y%m%dT%H%M%SZ)
short_id=${MESSAGE_ID:0:12}
audit_file="$AUDIT_DIR/${stamp}-${ROLE}-${short_id}.md"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-run: would ack-pending role=${ROLE} id=${MESSAGE_ID} kind=${kind} from=${from} to=${to} createdAt=${created_at} audit=${audit_file}"
  exit 0
fi

mkdir -p "$AUDIT_DIR"
cat > "$audit_file" <<EOF
# Queue Reconciliation Action Audit

Created: ${stamp}
Operator: ${OPERATOR}
Target role: ${ROLE}
Message id: ${MESSAGE_ID}
Command category: \`ack\`

## Evidence

- Queue-state report reference: live \`awg peek --as ${ROLE}\` immediately before action
- Completed or archived artifact, close report, or merged pull request: ${EVIDENCE}
- Per-item operator decision: ${DECISION}

## Pre-Action Checks

- Evidence exists before action: yes
- Target role and message id match the queue-state report: yes
- Action is item-by-item, not bulk: yes
- Action uses AWG CLI queue-aware command: yes
- No direct queue JSON mutation: yes
- No deletion of queue state: yes
- No \`recv\` used for reconciliation: yes
- No automatic superseded classification by tooling: yes; operator supplied \`--decision\`

## Drift Check Metadata

- kind: ${kind}
- from: ${from}
- to: ${to}
- createdAt: ${created_at}

## Result

- Command category used: \`ack-pending\`
- Outcome: pending
- Verification after action: pending

## Remaining Risk

- Known uncertainty: none recorded before action
- Follow-up required: verify role pending count after action
EOF

run_awg ack-pending --as "$ROLE" --id "$MESSAGE_ID" \
  --expect-kind "$kind" \
  --expect-from "$from" \
  --expect-to "$to" \
  --expect-created-at "$created_at" >/dev/null

status_json=$(run_awg status --as "$ROLE")
python3 - "$status_json" "$audit_file" <<'PY'
import json
import sys
status = json.loads(sys.argv[1])
audit_file = sys.argv[2]
with open(audit_file, "a", encoding="utf-8") as file:
    file.write("\n## Post-Action Verification\n\n")
    file.write("- Outcome: ack-pending succeeded\n")
    file.write(f"- Role status: pending={status.get('pending')} processing={status.get('processing')} processed={status.get('processed')} dead={status.get('dead')}\n")
PY

echo "acked role=${ROLE} id=${MESSAGE_ID} audit=${audit_file}"
