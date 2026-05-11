#!/usr/bin/env bash
set -euo pipefail

# Category: queue-operation
# Role: Read-only TimeoutChecker-backed response-contract breach monitor.
#
# awg-response-contract-monitor.sh — Response-contract breach reporter.
#
# Runtime companion to scripts/awg-response-contract-check.sh. Uses
# src/agent_working_group/timeout.py:TimeoutChecker.response_contract_breaches()
# directly so the script and library stay in lockstep.
#
# For every queue message that carries an integer expectedResponseWithin
# field (seconds) and has been sitting in inbox/ or processing/ for
# longer than the contract, this script emits one JSON object per
# breach on stdout:
#
#   {"type":"response.contract.breach", "agent":..., "messageId":...,
#    "file":..., "location":..., "expectedSeconds":..., "actualSeconds":...}
#
# Env:
#   AWG_ROOT  Working-group root (default $PWD/.agent-working-group).
#
# Exit codes:
#   0 — no breaches
#   1 — at least one breached contract
#
# Read-only: never moves, mutates, acks, or deletes queue files.

AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}

project_root=$(cd "$(dirname "$0")/.." && pwd)

PYTHONPATH="${project_root}/src${PYTHONPATH:+:$PYTHONPATH}" \
AWG_ROOT="$AWG_ROOT" \
python3 - <<'PY'
import json
import os
import sys

from agent_working_group.timeout import TimeoutChecker

root = os.environ["AWG_ROOT"]
checker = TimeoutChecker(root)
breaches = checker.response_contract_breaches()

for breach in breaches:
    alert = {"type": "response.contract.breach", **breach.to_dict()}
    sys.stdout.write(json.dumps(alert, ensure_ascii=False) + "\n")

sys.stderr.write(f"scanned breaches={len(breaches)}\n")

raise SystemExit(1 if breaches else 0)
PY
