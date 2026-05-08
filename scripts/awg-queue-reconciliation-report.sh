#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: awg-queue-reconciliation-report.sh --role <name>

Read-only reconciliation report helper for one AWG role queue.

The helper observes queue state with non-consuming AWG CLI commands and prints
message id, kind, from, to, and createdAt fields grouped by queue state. It does
not classify messages as superseded and does not perform queue mutation.

Environment:
  AWG_CLI   AWG command to run (default: awg)
  AWG_ROOT  AWG root passed to the CLI when set
USAGE
}

ROLE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --role)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        echo "error: --role requires a value" >&2
        exit 2
      fi
      ROLE=$2
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$ROLE" ]; then
  echo "error: missing required --role <name>" >&2
  usage >&2
  exit 2
fi

AWG_CLI=${AWG_CLI:-awg}
AWG_ARGS=()
if [ -n "${AWG_ROOT:-}" ]; then
  AWG_ARGS+=(--root "$AWG_ROOT")
fi

run_awg() {
  "$AWG_CLI" "${AWG_ARGS[@]}" "$@"
}

print_messages() {
  state=$1
  json_data=$2
  printf '%s' "$json_data" | python3 -c '
import json
import sys

state = sys.argv[1]
messages = json.load(sys.stdin)
print(f"## {state}")
if not messages:
    print("- none")
else:
    for message in messages:
        fields = [
            "id={}".format(message.get("id", "")),
            "kind={}".format(message.get("kind", "")),
            "from={}".format(message.get("from", "")),
            "to={}".format(message.get("to", "")),
            "created={}".format(message.get("createdAt", "")),
        ]
        print("- " + " ".join(fields))
' "$state"
}

printf 'Queue reconciliation read-only report\n'
printf 'Role: %s\n' "$ROLE"
printf 'Classification: queue-state-only; operator decides reconciliation\n\n'

printf '## status\n'
status_json=$(run_awg status --as "$ROLE")
printf '%s' "$status_json" | python3 -c '
import json
import sys

status = json.load(sys.stdin)
for key in ("pending", "processing", "dead"):
    print(f"- {key}={status.get(key, 0)}")
'
printf '\n'

inbox_json=$(run_awg peek --as "$ROLE")
print_messages inbox "$inbox_json"
printf '\n'
processing_json=$(run_awg processing --as "$ROLE")
print_messages processing "$processing_json"
printf '\n'
dead_json=$(run_awg dead --as "$ROLE")
print_messages dead "$dead_json"
