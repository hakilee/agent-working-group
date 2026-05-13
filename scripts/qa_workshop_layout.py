#!/usr/bin/env python3
"""Static QA guard for Workshop office layout and collision regressions."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAYOUT = ROOT / "dashboard" / "src" / "workshop" / "engine" / "office-layout.ts"
TEXTURES = ROOT / "dashboard" / "src" / "workshop" / "three" / "textures.ts"
TYPES = ROOT / "dashboard" / "src" / "workshop" / "engine" / "types.ts"
RENDERER = ROOT / "dashboard" / "src" / "workshop" / "three" / "renderer.ts"


def require(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def block_for_id(source: str, furniture_id: str) -> str:
    pattern = re.compile(r"addFurniture\(b, \{(?P<body>.*?id: ['`]" + re.escape(furniture_id) + r"['`].*?)\}\s*(?:,\s*false)?\);", re.S)
    match = pattern.search(source)
    return match.group("body") if match else ""


def main() -> int:
    source = LAYOUT.read_text(encoding="utf-8")
    textures = TEXTURES.read_text(encoding="utf-8")
    types = TYPES.read_text(encoding="utf-8")
    renderer = RENDERER.read_text(encoding="utf-8")
    failures: list[str] = []

    require("WORKSHOP_ASSET_REV = 'office-garden-v4'" in textures,
            "asset cache-bust revision must identify the office/garden refactor", failures)
    require("'garden_bed'" in types and "'fountain_tower'" in types,
            "garden/fountain furniture kinds must be typed", failures)
    require("case 'garden_bed'" in renderer and "case 'fountain_tower'" in renderer,
            "Three.js renderer must map garden/fountain furniture textures", failures)
    require("makeWorkshopPropTexture('garden_bed')" in textures and "makeWorkshopPropTexture('fountain_tower')" in textures,
            "garden/fountain procedural textures must be created", failures)

    require("id: 'garden-atrium'" in source and "label: 'Garden Atrium'" in source,
            "layout must include a named garden atrium zone", failures)
    require("id: 'garden-fountain-tower'" in source,
            "layout must include a fountain tower", failures)
    require("id: 'garden-bed-north'" in source and "id: 'garden-bed-south'" in source,
            "layout must include garden beds", failures)

    fountain = block_for_id(source, "garden-fountain-tower")
    require("kind: 'fountain_tower'" in fountain and "w: 3" in fountain and "h: 3" in fountain,
            "fountain tower must be a 3x3 visual anchor", failures)
    require("blocking: true" in fountain,
            "fountain tower must block pathfinding through its footprint", failures)

    table = block_for_id(source, "meeting-table")
    require("blocking: true" in table, "meeting table must block its own footprint", failures)
    require("pushBlocked(b, tableCol, tableRow - 1, 3, 1)" in source,
            "meeting table must reserve its north visual edge", failures)
    for blocked_spot in ("{ col: 30, row: 4 }", "{ col: 31, row: 4 }", "{ col: 32, row: 4 }"):
        require(blocked_spot not in source, "meeting spots must not use the table's reserved north edge", failures)

    coffee = block_for_id(source, "lounge-coffee-maker")
    require("blocking: true" in coffee, "coffee maker must block its tile", failures)
    require("id: 'coffee-maker'" in source and "col: 35, row: 13" in source and "facingDir: Direction.RIGHT" in source,
            "coffee activity must stand beside the maker instead of inside it", failures)

    pc_blocks = [m.group(0) for m in re.finditer(r"id: `pc-\$\{seatId\}`.*?\}\s*(?:,\s*false)?\);", source, re.S)]
    top_pcs = [block for block in pc_blocks if "variant: 'back'" in block]
    bottom_pcs = [block for block in pc_blocks if "variant: 'front'" in block and "OPEN_BOTTOM_DESK_ROW" in block]
    reception_pcs = [block for block in pc_blocks if "variant: 'front'" in block and "col: 4, row: 18" in block]
    require(top_pcs and all("blocking: true" in block and "}, false" not in block for block in top_pcs),
            "top/back PCs must be blocking", failures)
    require(bottom_pcs and all("blocking: false" in block and "}, false" in block for block in bottom_pcs),
            "bottom PCs share chair tiles and must remain non-blocking", failures)
    require(reception_pcs and all("blocking: true" in block and "}, false" not in block for block in reception_pcs),
            "reception front PC must be blocking", failures)

    if failures:
        raise SystemExit("\n".join(failures))
    print("validated Workshop office/garden layout guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
