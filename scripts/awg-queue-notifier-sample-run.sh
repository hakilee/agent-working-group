#!/usr/bin/env bash
set -euo pipefail

DISPATCH=${DISPATCH:-scripts/awg-queue-notifier-dispatch.sh}
FORMAT=json
ROLE_MAP=""
STATE_FILE=""
LOG_FILE=""
ROLES=()

usage() {
  cat <<'USAGE'
Usage: awg-queue-notifier-sample-run.sh --role ROLE [--role ROLE ...] [options]

Run one manual no-install notifier dispatch tick. The sample prints provider-neutral
payloads to stdout and, when --log-file is supplied, appends the same payload to a
local operator log. It does not install timers or send externally.

Options:
  --role ROLE          Queue role to inspect. Repeat for multiple roles.
  --role-map PATH      Optional dispatch role map JSON.
  --state-file PATH    Optional notifier state file passed through to dispatch.
  --format json|text   Output format. Default: json.
  --log-file PATH      Optional local append-only sample log.
  --dispatch PATH      Dispatch helper path. Default: scripts/awg-queue-notifier-dispatch.sh.
  --help               Show this help.
USAGE
}

require_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    echo "$1 requires a non-empty value" >&2
    exit 64
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --role) require_value "$1" "${2-}"; ROLES+=("$2"); shift 2 ;;
    --role-map) require_value "$1" "${2-}"; ROLE_MAP=$2; shift 2 ;;
    --state-file) require_value "$1" "${2-}"; STATE_FILE=$2; shift 2 ;;
    --format) require_value "$1" "${2-}"; FORMAT=$2; shift 2 ;;
    --log-file) require_value "$1" "${2-}"; LOG_FILE=$2; shift 2 ;;
    --dispatch) require_value "$1" "${2-}"; DISPATCH=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 64 ;;
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

if [ ! -x "$DISPATCH" ]; then
  echo "dispatch helper is not executable: $DISPATCH" >&2
  exit 66
fi

ARGS=(--format "$FORMAT")
for role in "${ROLES[@]}"; do
  ARGS+=(--role "$role")
done
if [ -n "$ROLE_MAP" ]; then
  ARGS+=(--role-map "$ROLE_MAP")
fi
if [ -n "$STATE_FILE" ]; then
  ARGS+=(--state-file "$STATE_FILE")
fi

OUTPUT=$("$DISPATCH" "${ARGS[@]}")
printf '%s\n' "$OUTPUT"

if [ -n "$LOG_FILE" ]; then
  mkdir -p "$(dirname -- "$LOG_FILE")"
  {
    printf -- '--- awg queue notifier sample run ---\n'
    date -u '+generatedAt=%Y-%m-%dT%H:%M:%SZ'
    printf '%s\n' "$OUTPUT"
  } >> "$LOG_FILE"
fi
