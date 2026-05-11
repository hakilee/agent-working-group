#!/usr/bin/env bash
set -euo pipefail

# Category: queue-operation
# Role: Read-only TimeoutChecker-backed processing/ stale-item monitor with notify payload.
#
# awg-processing-timeout-monitor.sh — Stale processing/ items via TimeoutChecker.
#
# This is a runtime companion to scripts/awg-processing-timeout-check.sh.
# Both observe the same processing/ directories, but the monitor:
#
#   - Uses src/agent_working_group/timeout.py:TimeoutChecker directly
#     instead of inlined Python, so script and library stay in lockstep.
#   - Emits one JSON object per stale item on stdout
#     ({"type":"processing.timeout", ...}) suitable for a downstream
#     dispatcher.
#   - Prints a provider-neutral notification payload on stdout if
#     AWG_NOTIFY_CHANNEL is set. AWG_NOTIFY_CHANNEL identifies the
#     destination channel id and AWG_NOTIFY_TARGET (optional) identifies
#     the target name or handle that should be paged. Delivery to any
#     remote system is the operator-owned wrapper's responsibility; this
#     monitor never reaches out over the network.
#
# Env:
#   AWG_ROOT                Working-group root (default $PWD/.agent-working-group).
#   AWG_PROCESSING_TIMEOUT  Seconds before processing is stale (default 600).
#   AWG_NOTIFY_CHANNEL      Optional notify channel id; emits a payload when set.
#   AWG_NOTIFY_TARGET       Optional notify target/handle attached to the payload.
#
# Exit codes:
#   0 — no stale items
#   1 — at least one stale item

AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
AWG_PROCESSING_TIMEOUT=${AWG_PROCESSING_TIMEOUT:-600}
AWG_NOTIFY_CHANNEL=${AWG_NOTIFY_CHANNEL:-}
AWG_NOTIFY_TARGET=${AWG_NOTIFY_TARGET:-}

project_root=$(cd "$(dirname "$0")/.." && pwd)

PYTHONPATH="${project_root}/src${PYTHONPATH:+:$PYTHONPATH}" \
AWG_ROOT="$AWG_ROOT" \
AWG_PROCESSING_TIMEOUT="$AWG_PROCESSING_TIMEOUT" \
AWG_NOTIFY_CHANNEL="$AWG_NOTIFY_CHANNEL" \
AWG_NOTIFY_TARGET="$AWG_NOTIFY_TARGET" \
python3 - <<'PY'
import json
import os
import sys

from agent_working_group.timeout import TimeoutChecker

root = os.environ["AWG_ROOT"]
timeout_seconds = int(os.environ.get("AWG_PROCESSING_TIMEOUT") or 600)
notify_channel = os.environ.get("AWG_NOTIFY_CHANNEL") or ""
notify_target = os.environ.get("AWG_NOTIFY_TARGET") or ""

checker = TimeoutChecker(root)
stale = checker.stale_processing(timeout_seconds=timeout_seconds)

for item in stale:
    alert = {"type": "processing.timeout", **item.to_dict()}
    sys.stdout.write(json.dumps(alert, ensure_ascii=False) + "\n")

if stale and notify_channel:
    payload = {
        "type": "processing.timeout.notification",
        "channel": notify_channel,
        "target": notify_target,
        "eventType": "awg.processing.timeout.v1",
        "alertCount": len(stale),
        "alerts": [item.to_dict() for item in stale],
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")

sys.stderr.write(
    f"scanned timeout={timeout_seconds}s stale={len(stale)} "
    f"notify_channel={notify_channel or '-'}\n"
)

raise SystemExit(1 if stale else 0)
PY
