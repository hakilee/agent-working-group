# Workshop Action Sprite Runtime QA

Created: 2026-05-13T12:51:27Z

## Scope

Follow-up for PR #78 after runtime feedback that lateral walking still appeared front-facing and current office actions lacked matching poses.

## Changes Verified

- Character sheets expanded from 7 to 10 frames per direction: idle/walk/type/read plus coffee, wash, and sit poses.
- Direction slicing remains down/up/right with left produced by mirroring the right-facing side row.
- Runtime state mapping now supports `sit`, `coffee`, and `wash` in both Three.js and canvas renderers.
- Coffee maker and wash station activities now use action states instead of `idle`.
- Seated idle agents now use `sit` instead of generic front-facing idle.
- Three.js renderer adds explicit pixel action cues for type, coffee, wash, and sit so tiny 16x32 body frames are not the only readability signal.
- Asset URLs include `sprite-detail-actions-v1` cache-busting to avoid stale character/floor/wall sprites.

## Evidence

- `npm --prefix dashboard run build` passed.
- `python3 scripts/gen_workshop_sprites.py --reference /tmp/pixel-agents-ref/webview-ui/public/assets --contact-sheet artifacts/workshop-sprite-contact-sheet.png` passed.
- `git diff --check` passed.
- Live `https://awg.haklee.me/workshop` served built bundle `assets/index-CgvFndcF.js` after build.
- Live `https://awg.haklee.me/assets/characters/char_0.png?v=sprite-detail-actions-v1` hash matched local `dashboard/public/assets/characters/char_0.png` and reported PNG size `160 x 96`.

## Residual Risk

- Browser tabs already open before this build may still need a hard refresh to drop old in-memory textures.
- A 16x32 character body alone cannot make every action obvious at runtime scale; action cue overlays are intentionally included as the readability fallback.
