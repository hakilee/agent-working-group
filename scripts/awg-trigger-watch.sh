#!/usr/bin/env bash
set -euo pipefail

# Category: queue-operation
# Role: Thin watch wrapper for awg-trigger-router.sh (B' Stage 1 fast path).
#
# This is a dumb pipe, NOT an agent: it only detects queue-file changes and
# invokes the one-shot router. Prefer fswatch when installed; otherwise fall
# back to a sentinel-file poll (find -newer) at POLL_SECONDS cadence.
#
# The 30-min inbox watchdog remains the slow-path safety net; this wrapper is
# additive and must never be required for correctness.
#
# Usage:
#   scripts/awg-trigger-watch.sh            (foreground loop; run under tmux)
#
# Environment (all forwarded to the router):
#   AWG_ROOT, AWG_CLI, WORKER, WORKER_SESSION, MAX_TASKS, MAX_IDLE_SECONDS,
#   LEAD_WAKE, REVIEWER_WAKE, WORKER_SPAWN, SHADOW (1 = run router with --shadow)
#   POLL_SECONDS fallback poll interval (default 5)

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")") && pwd
ROUTER="${SCRIPT_DIR}/awg-trigger-router.sh"
AWG_ROOT=${AWG_ROOT:-"$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)/.agent-working-group"}
POLL_SECONDS=${POLL_SECONDS:-5}
SHADOW=${SHADOW:-0}
SENTINEL="${AWG_ROOT}/tmp/trigger-watch.sentinel"
[[ -d "${AWG_ROOT}/tmp" ]] || mkdir -p "${AWG_ROOT}/tmp"

ROUTER_ARGS=()
[[ "$SHADOW" == "1" ]] && ROUTER_ARGS+=(--shadow)

echo "[watch] starting: root=${AWG_ROOT} poll=${POLL_SECONDS}s shadow=${SHADOW} router=${ROUTER}"

run_router() {
  bash "$ROUTER" "${ROUTER_ARGS[@]}" || echo "[watch] router exited rc=$? (non-fatal; next tick will retry)"
}

# Baseline: run once immediately at start (covers changes missed while down).
run_router
touch "$SENTINEL"

if command -v fswatch >/dev/null 2>&1; then
  echo "[watch] using fswatch on ${AWG_ROOT}/queues"
  # -0: null-separated; debounce via latency window; router is one-shot + lock-guarded,
  # so a burst of events collapses into one effective pass.
  fswatch -0 --event Created --event Updated --event Renamed \
    "${AWG_ROOT}/queues" | while read -r -d '' _event; do
    # coalesce events that arrive within a short window
    while IFS= read -r -t 1 _more; do :; done 2>/dev/null || true
    touch "$SENTINEL"
    run_router
  done
else
  echo "[watch] fswatch not found; sentinel poll every ${POLL_SECONDS}s (find -newer)"
  while true; do
    if find "${AWG_ROOT}/queues" -newer "$SENTINEL" -print -quit 2>/dev/null | grep -q .; then
      touch "$SENTINEL"
      run_router
    fi
    sleep "$POLL_SECONDS"
  done
fi
