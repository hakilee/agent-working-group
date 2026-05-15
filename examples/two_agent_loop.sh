#!/usr/bin/env bash
set -euo pipefail

AWG_BIN=${AWG_BIN:-awg}
ROOT=${1:-/tmp/agent-working-group-demo}

case "$ROOT" in
  /tmp/*|/var/tmp/*) ;;
  *)
    echo "Refusing to reset non-temporary demo root: $ROOT" >&2
    echo "Pass a path under /tmp or /var/tmp for this demo." >&2
    exit 2
    ;;
esac

rm -rf "$ROOT"
export AWG_ROOT="$ROOT"

"$AWG_BIN" init

TASK_ID=$("$AWG_BIN" send \
  --from lead \
  --to reviewer \
  --kind instruction \
  --body "Review the demo change and report whether it is ready." \
  --correlation-id demo-task-001 \
  --source-channel local-demo \
  --report-target terminal \
  --repo example/project \
  --workspace demo-main)

echo "sent task: $TASK_ID"

echo "reviewer receives instruction:"
MESSAGE=$("$AWG_BIN" recv --as reviewer --timeout 5)
echo "$MESSAGE"

RECEIVED_ID=$(MESSAGE_JSON="$MESSAGE" python3 - <<'PY'
import json
import os

print(json.loads(os.environ["MESSAGE_JSON"])["id"])
PY
)

"$AWG_BIN" send \
  --from reviewer \
  --to lead \
  --kind status \
  --reply-to "$RECEIVED_ID" \
  --correlation-id demo-task-001 \
  --parent-id "$RECEIVED_ID" \
  --body "done: demo review passed; no code changes required"

"$AWG_BIN" ack --as reviewer --id "$RECEIVED_ID"

echo "lead receives status:"
"$AWG_BIN" recv --as lead --timeout 5

echo "reviewer final status:"
"$AWG_BIN" status --as reviewer --tz UTC

echo "lead final status:"
"$AWG_BIN" status --as lead --tz UTC

echo "demo root: $AWG_ROOT"
