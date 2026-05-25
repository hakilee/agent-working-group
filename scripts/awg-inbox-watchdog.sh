#!/usr/bin/env bash
set -euo pipefail

# Category: queue-operation
# Role: Periodic inbox watchdog — alerts and auto-acks stale answered messages.
#
# Problem it solves:
#   lead, reviewer roles have no dedicated worker loop.
#   When reviewer sends QA results (answer/status) to lead, nobody calls
#   recv/ack-pending, so messages pile up indefinitely.
#
# What it does:
#   1. Scans all role inboxes for messages older than ACK_THRESHOLD_SECONDS.
#   2. For "answer" and "status" kinds (which are terminal notifications),
#      auto-acks them to processed/ with an audit record.
#   3. For "instruction" kinds (action items), only reports — never auto-acks.
#   4. Prints a summary to stdout. Exit 1 if any instruction items are stale
#      (so launchd/cron can trigger an alert).
#
# Environment:
#   AWG_ROOT    AWG root directory
#   AWG_CLI     CLI path (default: awg)
#   ACK_THRESHOLD_SECONDS  How old before a message is considered stale (default: 3600 = 1hr)
#   ROLES       Space-separated list of roles to check (default: lead reviewer worker)
#   DRY_RUN     Set to 1 to only report, not ack

AWG_CLI=${AWG_CLI:-awg}
ACK_THRESHOLD_SECONDS=${ACK_THRESHOLD_SECONDS:-3600}
ROLES=${ROLES:-"lead reviewer worker"}
DRY_RUN=${DRY_RUN:-0}
AWG_ROOT=${AWG_ROOT:-""}

now_epoch=$(date +%s)
auto_acked=0
stale_instructions=0
total_scanned=0

run_awg() {
  if [[ -n "$AWG_ROOT" ]]; then
    "$AWG_CLI" --root "$AWG_ROOT" "$@"
  else
    "$AWG_CLI" "$@"
  fi
}

for role in $ROLES; do
  inbox_json=$(run_awg peek --as "$role" 2>/dev/null || echo "[]")
  count=$(printf '%s' "$inbox_json" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

  if [[ "$count" == "0" ]]; then
    continue
  fi

  printf '[%s] %s: %s inbox items\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$role" "$count"

  # Process each message
  printf '%s' "$inbox_json" | python3 -c "
import json, sys, time
now = int(time.time())
threshold = int(sys.argv[1])
messages = json.load(sys.stdin)
for msg in messages:
    created_ms = msg.get('createdAtMs', 0)
    if created_ms == 0:
        continue
    age_seconds = now - created_ms // 1000
    kind = msg.get('kind', '')
    msg_id = msg.get('id', '')
    sender = msg.get('from', '')
    body_preview = msg.get('body', '')[:120].replace('\n', ' ')
    is_stale = age_seconds > threshold
    auto_ackable = kind in ('answer', 'status')
    print(f'{msg_id}\t{kind}\t{sender}\t{age_seconds}\t{is_stale}\t{auto_ackable}\t{body_preview}')
" "$ACK_THRESHOLD_SECONDS" | while IFS=$'\t' read -r msg_id kind sender age_seconds is_stale auto_ackable body_preview; do
    total_scanned=$((total_scanned + 1))

    if [[ "$is_stale" != "True" ]]; then
      continue
    fi

    if [[ "$auto_ackable" == "True" ]]; then
      if [[ "$DRY_RUN" == "1" ]]; then
        printf '  [DRY-RUN] would ack-pending %s/%s kind=%s from=%s age=%ss\n' "$role" "$msg_id" "$kind" "$sender" "$age_seconds"
      else
        if run_awg ack-pending --as "$role" --id "$msg_id" 2>/dev/null; then
          printf '  [ACK] %s/%s kind=%s from=%s age=%ss\n' "$role" "$msg_id" "$kind" "$sender" "$age_seconds"
          auto_acked=$((auto_acked + 1))
        else
          printf '  [ERROR] failed to ack %s/%s\n' "$role" "$msg_id" >&2
        fi
      fi
    else
      printf '  [STALE-ACTION] %s/%s kind=%s from=%s age=%ss (not auto-acked)\n' "$role" "$msg_id" "$kind" "$sender" "$age_seconds"
      printf '    body: %s\n' "$body_preview"
      stale_instructions=$((stale_instructions + 1))
    fi
  done
done

printf '[%s] watchdog done: scanned=%s auto_acked=%s stale_actions=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$total_scanned" "$auto_acked" "$stale_instructions"

# Exit 1 if there are stale action items that need human attention
if [[ "$stale_instructions" -gt 0 ]]; then
  exit 1
fi
