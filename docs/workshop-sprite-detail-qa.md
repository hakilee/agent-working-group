# Workshop Sprite Detail QA

Created: 2026-05-13T11:14:38Z
PR: #78
Scope: remaining sprite/product-quality risks after pixel-agents baseline restore.

## Checklist

- [x] Direction fidelity: while walking RIGHT/LEFT/UP/DOWN, character sprite row matches movement direction, including reduced-motion mode.
- [x] Arrival fidelity: when an agent reaches a desk/activity, final facing direction matches seat/activity intent.
- [x] Natural sprite sizing: furniture renders at source PNG pixel dimensions and is bottom-anchored to footprint; no stretched table/coffee/bin/small-table sprites.
- [x] Animated monitors: front active PCs cycle through `PC_FRONT_ON_1/2/3`; inactive/back/side PCs do not use wrong frames.
- [x] Bespoke office identity: Workshop includes AWG-specific visible props, not only copied starter-pack furniture.
- [x] Pixel crispness: image smoothing remains disabled; no blur from texture filtering or CSS scaling.
- [x] Layering: furniture/characters/particles sort by foot Y so sprites do not pop through desks/walls incorrectly.
- [x] Asset pipeline safety: sprite script validates checked-in assets and cannot silently regenerate crude placeholder art.
- [x] Contact sheet: latest contact sheet generated for quick visual inspection.
- [x] Build: dashboard TypeScript and Vite build pass; only known large chunk warning is acceptable.
- [x] Queue hygiene: AWG worker queues have no dead or stuck sprite QA items after review.

## Current Findings

- Direction bug likely source: `updateCharacter` only sets `c.dir` inside the non-reduced-motion walking branch. In reduced-motion mode, tile hops can preserve the previous facing direction, which can make rightward movement look front-facing.
- Bespoke identity gap: baseline assets are polished but generic. Add AWG-specific status/queue/review boards using pixel-rendered overlays before considering the risk closed.

## Resolution Notes

- Direction fidelity: `updateCharacter` now computes `c.dir` before both reduced-motion tile hops and interpolated movement, so right/left/up/down walking applies the correct sprite row immediately.
- Bespoke office identity: added pixel-rendered AWG-specific `queue_board`, `status_wall`, and `review_terminal` furniture kinds with Three.js textures and Canvas fallback rendering.
- Placement: added a queue board in the meeting room, a status wall in ops, and a review terminal in focus to make the office read as an agent-working-group workspace rather than a generic starter pack.
- Verification: `git diff --check`, sprite reference validation, sprite local validation/contact sheet generation, `cd dashboard && npm run build`, and AWG queue status all passed. Build still has only the existing Vite large chunk warning.
