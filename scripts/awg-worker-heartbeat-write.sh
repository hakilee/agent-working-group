#!/usr/bin/env bash
set -euo pipefail

# Category: worker-infrastructure
# Role: Worker-owned heartbeat writer; the only script that writes to $AWG_ROOT/heartbeats/.
#
# awg-worker-heartbeat-write.sh — refresh one worker heartbeat file.
#
# Workers MUST call this script periodically (e.g. every
# WORKER_HEARTBEAT_INTERVAL seconds, default 60) so observer scripts
# under scripts/awg-heartbeat-monitor.sh and the on_processing hook
# adapter scripts/awg-hook-worker-heartbeat.sh can detect liveness.
#
# Contract:
#   - File path: $AWG_ROOT/heartbeats/${AWG_AGENT}/${AWG_SESSION}.ts
#   - File content: a single line containing the current Unix epoch
#     seconds integer.
#   - Re-running the script overwrites the file in place.
#   - This is the ONLY script that writes under $AWG_ROOT/heartbeats/.
#
# Required env:
#   AWG_AGENT    Agent role this worker is processing as.
#   AWG_SESSION  Session identifier (e.g. tmux session or worker PID).
#
# Optional env:
#   AWG_ROOT     Working-group root (default: $PWD/.agent-working-group).

AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
AWG_AGENT=${AWG_AGENT:-${WORKER:-}}
AWG_SESSION=${AWG_SESSION:-}

if [ -z "$AWG_AGENT" ]; then
  echo "AWG_AGENT (or WORKER) must be set" >&2
  exit 64
fi
if [ -z "$AWG_SESSION" ]; then
  echo "AWG_SESSION must be set" >&2
  exit 64
fi

heartbeat_dir="${AWG_ROOT}/heartbeats/${AWG_AGENT}"
heartbeat_file="${heartbeat_dir}/${AWG_SESSION}.ts"
mkdir -p "$heartbeat_dir"

now=$(date +%s)
tmp=$(mktemp "${heartbeat_dir}/.${AWG_SESSION}.ts.XXXXXX")
printf '%s\n' "$now" >"$tmp"
mv "$tmp" "$heartbeat_file"

echo "$heartbeat_file"
