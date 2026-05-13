# Workshop WS/Fallback/Canvas Font QA

Created: 2026-05-13T06:45:02Z

## Scope
Verify the current local Workshop changes after the socket/fallback/font pass.

## Context
Hak reported intermittent missing backend data over the Workshop WebSocket, which can leave agents visually stuck mid-walk. Hak also reported awkward canvas-rendered font and asked to clear the unknown 12 pending lead messages.

## Changes To Review
- Backend WebSocket now serializes concurrent sends through a lock.
- Backend sends an authoritative workshop snapshot immediately after `agentUpdate` and periodically on heartbeat timeout.
- Frontend Workshop hook now does REST fallback for `/api/workshop` and `/api/queues`, fetches on connect/reconnect, and reconnects a stale-open socket.
- Canvas labels now use the loaded dashboard fonts instead of browser-default monospace.
- Lead inbox pending 12 messages were inspected and acked; they were old worker start/blocker/success/status messages from the prior MATDORI QA attempt.

## Required Checks
1. Confirm no race/concurrent-send issue remains in `dashboard/server/routers/workshop.py`.
2. Confirm frontend fallback does not create a render loop or excessive API pressure.
3. Confirm a stale-open socket can recover via REST fallback/reconnect.
4. Confirm persisted/restored walking state cannot remain non-restorable.
5. Confirm canvas label/font change is visually/product-wise cleaner and does not break tiny pixel labels.
6. Run at least:
   - `python3 -m py_compile dashboard/server/services/workshop_state.py dashboard/server/routers/workshop.py`
   - `cd dashboard && npm run build`
   - `git diff --check`

## Report Format
Return PASS/FAIL, concrete findings with file paths, and any required fixes. Do not modify files unless explicitly necessary to validate a finding.
