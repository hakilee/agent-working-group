#!/usr/bin/env python3
"""Static QA guard for the Gather-style Workshop startup campus.

The Workshop map is now shaped after Gather startup-office compositions: a
large walkable campus spine, compact room neighborhoods, repeated windows,
plants, desks, lounge clusters, and outdoor greenery. These checks preserve
those structural decisions and the collision invariants that previously broke
runtime movement.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAYOUT = ROOT / "dashboard" / "src" / "workshop" / "engine" / "office-layout.ts"
TEXTURES = ROOT / "dashboard" / "src" / "workshop" / "three" / "textures.ts"
TYPES = ROOT / "dashboard" / "src" / "workshop" / "engine" / "types.ts"
RENDERER = ROOT / "dashboard" / "src" / "workshop" / "three" / "renderer.ts"
PAGE = ROOT / "dashboard" / "src" / "pages" / "workshop.tsx"


def require(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def main() -> int:
    source = LAYOUT.read_text(encoding="utf-8")
    textures = TEXTURES.read_text(encoding="utf-8")
    types = TYPES.read_text(encoding="utf-8")
    renderer = RENDERER.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")
    failures: list[str] = []

    require(
        re.search(r"WORKSHOP_ASSET_REV\s*=\s*'(?:office-garden-v\d+|gather-office-v\d+)'", textures) is not None,
        "asset cache-bust revision must use a recognized Workshop cache-bust naming scheme",
        failures,
    )
    require("CAMERA_ROOM_TOUR_ORDER" not in page and "CAMERA_TOUR_INTERVAL_MS" not in page,
            "Workshop camera must not auto-tour rooms while agents are idle", failures)
    require("const lead = chars.find((c) => c.role === 'lead')" in page,
            "Workshop camera must keep a stable lead/agent focus instead of falling back to map center", failures)
    require("CAMERA_VIEW_DEADZONE_W_RATIO" in page and "CAMERA_ACTIVE_CLUSTER_RADIUS_PX" in page,
            "Workshop camera must keep Gather-like dead-zone and clustered active-agent targeting", failures)

    require("const COLS = 78" in source and "const ROWS = 46" in source,
            "layout must use the rebuilt wide startup-campus footprint", failures)
    for zone in (
        "north-boardroom", "north-open-office", "north-focus-suite", "east-greenhouse",
        "west-call-room", "central-lounge", "east-team-room", "south-game-lounge",
        "south-maker-lab", "south-library", "south-quiet-room",
    ):
        require(f"id: '{zone}'" in source, f"layout missing startup room zone {zone}", failures)
    require("function isInMainSpine" in source and "floorVariant: 8" in source,
            "layout must include a broad Gather-style circulation spine and feature flooring", failures)
    require("function buildOutdoorCampus" in source and "outdoor-tree" in source,
            "layout must include outdoor campus greenery, not only interior rooms", failures)

    for kind in (
        "garden_bed", "plaza_planter", "window_panel", "wall_panel", "maker_bench",
        "potted_plant_round", "potted_plant_leafy", "potted_plant_tall", "hedge_planter",
        "flower_shrub", "floor_sprout", "desk_plant", "hanging_vine",
    ):
        require(f"'{kind}'" in types, f"Gather-style furniture kind {kind} must be typed", failures)
        require(f"case '{kind}'" in renderer, f"Three.js renderer must map furniture kind {kind}", failures)
        require(f"makeGatherPropTexture('{kind}')" in textures, f"procedural texture must exist for {kind}", failures)
        require(f"'{kind}'" in source, f"layout must use furniture kind {kind}", failures)

    require("kind: 'fountain_tower'" not in source and "central-fountain" not in source,
            "old fountain-based map must stay removed", failures)
    require("id: 'central-garden'" not in source and "id: 'meeting-lounge'" not in source,
            "old v4 room map must be replaced, not patched in place", failures)

    window_count = source.count("addWindowBand") * 3 + source.count("kind: 'window_panel'")
    wall_art_count = source.count("addWallArt") + source.count("kind: 'wall_panel'")
    desk_count = source.count("addTopDesk(b,") + source.count("addBottomDesk(b,") + source.count("addSideDesk(b,")
    plant_kind_count = sum(source.count(f"'{kind}'") for kind in (
        "potted_plant_round", "potted_plant_leafy", "potted_plant_tall", "hedge_planter",
    ))
    botanical_accent_count = sum(source.count(f"'{kind}'") for kind in (
        "flower_shrub", "floor_sprout", "desk_plant", "hanging_vine",
    ))
    require(window_count >= 10, "startup campus must use repeated Gather-like window banks", failures)
    require(wall_art_count >= 4, "startup campus must use wall panels/signage for lived-in rooms", failures)
    require(desk_count >= 7, "startup campus must include multiple work neighborhoods", failures)
    require(plant_kind_count >= 16, "startup campus must use many blocking plant/planter variants", failures)
    require(botanical_accent_count >= 18, "startup campus must use non-blocking botanical accents for Gather density", failures)
    require("addFurniture(b, { id, kind, variant: 'front', col, row, w, h, spriteOverhangRows: overhang, blocking: false }, false)" in source,
            "tiny botanical accents must be non-blocking so density does not break navigation", failures)

    require("pushBlocked(b, tableCol" not in source,
            "old single meeting-table collision workaround should not be the basis of the new campus map", failures)
    require("team-coffee-maker" in source and "team-wash-station" in source,
            "coffee and wash activities must remain available in the startup team room", failures)

    top_pcs = re.findall(
        r"addFurniture\(b, \{[^}]*id:\s*`pc-\$\{seatId\}`[^}]*variant:\s*'back'[^}]*\}\s*(?:,\s*false)?\);",
        source,
    )
    bottom_pcs = re.findall(
        r"addFurniture\(b, \{[^}]*id:\s*`pc-\$\{seatId\}`[^}]*variant:\s*'front'[^}]*animated:\s*true[^}]*\}\s*,\s*false\);",
        source,
    )
    require(top_pcs and all("blocking: true" in block for block in top_pcs),
            "top/back PCs must be blocking", failures)
    require(bool(bottom_pcs),
            "bottom PCs must remain non-blocking so they share chair tiles", failures)

    if failures:
        raise SystemExit("\n".join(failures))
    print("validated Gather startup Workshop layout guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
