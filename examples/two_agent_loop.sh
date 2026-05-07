#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-/tmp/agent-working-group-demo}"
export AWG_ROOT="$ROOT"
rm -rf "$ROOT"

awg init --agent lead --agent worker

TASK_ID=$(awg send \
  --from=lead \
  --to=worker \
  --kind=instruction \
  --body="Create a short risk report and respond with status.")

echo "sent task: $TASK_ID"

MESSAGE=$(awg recv --as=worker --require-ack --timeout=5)
echo "worker received: $MESSAGE"

awg send \
  --from=worker \
  --to=lead \
  --kind=status \
  --body="done: risk report created; tests not required for demo"

awg ack --as=worker --id="$TASK_ID"

echo "lead receives status:"
awg recv --as=lead --timeout=5

echo "worker status:"
awg status --as=worker --tz=UTC
