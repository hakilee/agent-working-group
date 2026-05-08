#!/usr/bin/env bash
set -euo pipefail

AWG_CLI=${AWG_CLI:-awg}
AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
WORKER=${WORKER:-worker}
LEAD=${LEAD:-lead}
STALE_SECONDS=${STALE_SECONDS:-600}
MAX_RETRIES=${MAX_RETRIES:-3}
SEND_REMINDER=${SEND_REMINDER:-0}

status_json=$("$AWG_CLI" --root "$AWG_ROOT" status --as "$WORKER")
printf '%s\n' "$status_json"

if [[ "$SEND_REMINDER" == "1" ]]; then
  "$AWG_CLI" --root "$AWG_ROOT" send --from poller --to "$LEAD" --kind note --body "poll: checked worker=${WORKER}; use requeue-stale only when messages exceed STALE_SECONDS=${STALE_SECONDS}" >/dev/null
fi

if [[ "${REQUEUE_STALE:-0}" == "1" ]]; then
  "$AWG_CLI" --root "$AWG_ROOT" requeue-stale --as "$WORKER" --older-than-sec "$STALE_SECONDS" --max-retries "$MAX_RETRIES"
fi
