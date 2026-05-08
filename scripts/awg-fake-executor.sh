#!/usr/bin/env bash
set -euo pipefail

STATUS=${FAKE_EXECUTOR_STATUS:-success}
MESSAGE_FILE=${1:-}

if [[ -z "$MESSAGE_FILE" || ! -f "$MESSAGE_FILE" ]]; then
  echo '{"status":"failed","summary":"missing message file"}'
  exit 0
fi

case "$STATUS" in
  success)
    echo '{"status":"success","summary":"fake success","artifacts":["fake-artifact"],"verification":"fake verification passed"}'
    ;;
  retry)
    echo '{"status":"retry","summary":"fake retry requested"}'
    ;;
  question)
    echo '{"status":"question","summary":"fake question","question":"fake question?"}'
    ;;
  blocker)
    echo '{"status":"blocker","summary":"fake blocker"}'
    ;;
  failed|fail)
    echo '{"status":"failed","summary":"fake failure"}'
    ;;
  malformed)
    echo 'not-json'
    ;;
  unknown)
    echo '{"status":"unexpected","summary":"fake unknown"}'
    ;;
  minimal)
    echo '{"status":"success"}'
    ;;
  nonzero)
    echo '{"status":"success","summary":"should be ignored"}'
    exit 1
    ;;
  *)
    echo '{"status":"failed","summary":"unsupported fake status"}'
    ;;
esac
