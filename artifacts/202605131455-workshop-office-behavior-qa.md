# Workshop Office Behavior QA Request

Created: 2026-05-13T05:55:33Z

## Goal

QA the current uncommitted Workshop office changes and specifically verify the movement/behavior model after the latest collision, restore, backend persistence, and task pulse refinements.

Hak's latest direction: agents should not only move to arbitrary coordinates. Movement should have office-like targets and scenarios: for example, if there is a bathroom, agents go there and wash hands; similarly printer, whiteboard, lounge, library, reception, desk, etc. Movement should feel like an action with intent, not random coordinate picking.

## Scope

Repository: `/Users/haklee/claws/workspaces/agent-working-group`
Branch: `feat/workshop-page`
Relevant files:

- `dashboard/src/pages/workshop.tsx`
- `dashboard/src/workshop/engine/character.ts`
- `dashboard/src/workshop/engine/office-layout.ts`
- `dashboard/src/workshop/engine/pathfinding.ts`
- `dashboard/src/workshop/engine/renderer.ts`
- `dashboard/src/workshop/engine/types.ts`
- `dashboard/src/workshop/room-state.ts`
- `dashboard/src/workshop/types.ts`
- `dashboard/server/services/workshop_state.py`

## Current Known Changes To QA

- Role labels use `Lead`/`Worker`; internal names and emojis removed.
- Tooltip duplicate `Lead`/`LEAD` removed.
- Static furniture/plant blocking patched.
- Dynamic agent reservation, yield, and reroute added.
- Walking-with-empty-path guard added.
- Backend no longer persists/restores impossible `state: walk` without path/target.
- Task handoff/completion pulses added.
- Claude code review findings were applied:
  - snapshot restore no longer skips every walking agent unconditionally;
  - unmount persists walking agents as idle at tile coordinates;
  - blocked ambient errand coordinates moved off cactus tiles;
  - restore jitter helper and movement priority table added;
  - backend walk-state normalization centralized;
  - hover update is throttled by small position delta.

## QA Checklist

1. Backend/persistence
   - Confirm `/api/workshop` never returns `state: walk` after refresh/reconnect.
   - Confirm persisted `.agent-working-group/workshop-state.json` does not keep impossible walking states.
   - Confirm frontend restore does not create a walking pose with no path.

2. Movement/collision
   - Check person-person overlap: current tile and next tile reservation should prevent overlap.
   - Check person-furniture overlap: plants/cacti and other blocking props should not be entered.
   - Check yield/reroute behavior for two agents moving toward intersecting paths.
   - Check there is no obvious stop-mid-walk / walking pose while idle.

3. Office behavior product fit
   - Evaluate whether current `ambientErrandSpotFor()` and `wanderSpotFor()` are too coordinate-like.
   - Recommend a more explicit scenario/action model: destination has label, target tile, optional duration, animation/state, facing direction, and action text/effect.
   - Suggest a minimal first implementation that fits existing code without overengineering.

4. UI/maintainability
   - Confirm no `Symphony`, `Matdori`, emojis, stale duplicate role labels, `TODO/FIXME/legacy/deprecated/console.log` in Workshop sources.
   - Check against frontend-fundamentals-style principles: readable, predictable, cohesive, easy to change.

## Expected Output

Send a `status` message back to `lead` with:

- verdict: `PASS`, `CONDITIONAL PASS`, or `FAIL`;
- findings with file/line references;
- specific recommendations for scenario/action-based office behavior;
- whether the current branch is safe to continue implementation on;
- any verification commands run.

Do not push or publish externally.
