#!/usr/bin/env bash
set -euo pipefail

# Category: queue-operation
# Role: Read-only scan of $AWG_ROOT/heartbeats/ for stale or missing worker heartbeats.
#
# awg-heartbeat-monitor.sh — Read-only worker-heartbeat liveness audit.
#
# Scans every $AWG_ROOT/heartbeats/{agent}/{session}.ts file. Each file
# is expected to contain a single epoch-seconds integer refreshed by
# scripts/awg-worker-heartbeat-write.sh from a running worker.
#
# For each heartbeat file:
#   - If now - timestamp > WORKER_HEARTBEAT_TIMEOUT (default 300s) the
#     heartbeat is reported as stale.
#
# For each queue under $AWG_ROOT/queues/{agent}/processing/ that holds
# at least one in-flight item, if the agent has no heartbeat file the
# heartbeat is reported as missing.
#
# Output:
#   One JSON object per line on stdout:
#     {"type":"heartbeat.stale","agent":..,"session":..,"age_seconds":..,"timeout_seconds":..}
#     {"type":"heartbeat.missing","agent":..,"session":..}
#
# Exit codes:
#   0 — every heartbeat is fresh and every busy agent has a heartbeat
#   1 — at least one stale or missing heartbeat was reported
#
# Read-only: this script never writes, deletes, or moves anything under
# $AWG_ROOT/heartbeats/ or $AWG_ROOT/queues/.

AWG_ROOT=${AWG_ROOT:-"${PWD}/.agent-working-group"}
WORKER_HEARTBEAT_TIMEOUT=${WORKER_HEARTBEAT_TIMEOUT:-300}

heartbeats_dir="${AWG_ROOT}/heartbeats"
queues_dir="${AWG_ROOT}/queues"

now=$(date +%s)
alert_count=0

emit_stale() {
  local agent=$1 session=$2 age=$3 timeout=$4
  printf '{"type":"heartbeat.stale","agent":"%s","session":"%s","age_seconds":%s,"timeout_seconds":%s}\n' \
    "$agent" "$session" "$age" "$timeout"
  alert_count=$((alert_count + 1))
}

emit_missing() {
  local agent=$1 session=$2
  printf '{"type":"heartbeat.missing","agent":"%s","session":"%s"}\n' \
    "$agent" "$session"
  alert_count=$((alert_count + 1))
}

# 1. Stale-heartbeat scan.
if [ -d "$heartbeats_dir" ]; then
  while IFS= read -r ts_file; do
    [ -f "$ts_file" ] || continue
    agent=$(basename "$(dirname "$ts_file")")
    session_base=$(basename "$ts_file")
    session=${session_base%.ts}
    timestamp=$(head -n1 "$ts_file" 2>/dev/null | tr -d '[:space:]' || true)
    if [ -z "$timestamp" ] || ! [[ "$timestamp" =~ ^[0-9]+$ ]]; then
      emit_stale "$agent" "$session" 0 "$WORKER_HEARTBEAT_TIMEOUT"
      continue
    fi
    age=$((now - timestamp))
    if [ "$age" -gt "$WORKER_HEARTBEAT_TIMEOUT" ]; then
      emit_stale "$agent" "$session" "$age" "$WORKER_HEARTBEAT_TIMEOUT"
    fi
  done < <(find "$heartbeats_dir" -mindepth 2 -maxdepth 2 -type f -name '*.ts' 2>/dev/null)
fi

# 2. Missing-heartbeat scan: any agent with active processing items but
#    no heartbeat directory / file.
if [ -d "$queues_dir" ]; then
  while IFS= read -r processing_dir; do
    [ -d "$processing_dir" ] || continue
    processing_items=$(find "$processing_dir" -maxdepth 1 -type f -name '*.json' 2>/dev/null | head -n1)
    [ -n "$processing_items" ] || continue
    agent=$(basename "$(dirname "$processing_dir")")
    agent_heartbeat_dir="${heartbeats_dir}/${agent}"
    heartbeat_files=""
    if [ -d "$agent_heartbeat_dir" ]; then
      heartbeat_files=$(find "$agent_heartbeat_dir" -maxdepth 1 -type f -name '*.ts' 2>/dev/null | head -n1)
    fi
    if [ -z "$heartbeat_files" ]; then
      emit_missing "$agent" ""
    fi
  done < <(find "$queues_dir" -mindepth 2 -maxdepth 2 -type d -name processing 2>/dev/null)
fi

echo "scanned heartbeats_dir=${heartbeats_dir} alerts=${alert_count} timeout=${WORKER_HEARTBEAT_TIMEOUT}s" >&2

if [ "$alert_count" -gt 0 ]; then
  exit 1
fi
exit 0
