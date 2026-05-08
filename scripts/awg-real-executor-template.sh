#!/usr/bin/env bash
set -euo pipefail

# Opt-in adapter template for connecting the bridge to a real executor.
# Replace the deterministic mode handler with provider-specific code in a
# private wrapper. Keep the message body as data; never execute it as shell.
MODE=${AWG_REAL_EXECUTOR_MODE:-}
MESSAGE_FILE=${1:-}

json_string() {
  python3 - "$1" <<'PY'
import json, sys
print(json.dumps(sys.argv[1], ensure_ascii=False))
PY
}

emit() {
  local status=$1
  local summary=$2
  local extra_name=${3:-}
  local extra_value=${4:-}
  local status_json summary_json extra_json
  status_json=$(json_string "$status")
  summary_json=$(json_string "$summary")
  if [[ -n "$extra_name" ]]; then
    extra_json=$(json_string "$extra_value")
    printf '{"status":%s,"summary":%s,"%s":%s}\n' "$status_json" "$summary_json" "$extra_name" "$extra_json"
  else
    printf '{"status":%s,"summary":%s}\n' "$status_json" "$summary_json"
  fi
}

if [[ -z "$MESSAGE_FILE" || ! -f "$MESSAGE_FILE" ]]; then
  echo "missing message file" >&2
  emit failed "missing message file"
  exit 0
fi

if [[ -z "$MODE" ]]; then
  echo "AWG_REAL_EXECUTOR_MODE is required for this adapter template" >&2
  emit failed "missing adapter configuration"
  exit 0
fi

case "$MODE" in
  success)
    emit success "real executor template success" verification "deterministic template verification passed"
    ;;
  retry)
    emit retry "real executor template retry requested"
    ;;
  question)
    emit question "real executor template needs input" question "Provide the missing executor input."
    ;;
  blocker)
    emit blocker "real executor template blocker"
    ;;
  failed|fail)
    emit failed "real executor template failed"
    ;;
  malformed)
    echo 'not-json'
    ;;
  unknown)
    emit unexpected "real executor template unknown status"
    ;;
  nonzero)
    echo "real executor template nonzero failure" >&2
    exit 1
    ;;
  *)
    echo "unsupported AWG_REAL_EXECUTOR_MODE: $MODE" >&2
    emit failed "unsupported adapter mode"
    ;;
esac
