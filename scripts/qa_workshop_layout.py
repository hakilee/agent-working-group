#!/usr/bin/env python3
"""Static QA guard for Workshop office layout and collision regressions.

The expanded Workshop layout adds a central grass garden, an outdoor cafe
terrace, and side-oriented workbenches. The checks below are intentionally
phrased in terms of intent (a garden zone exists, the meeting table reserves
its north edge, the coffee maker activity stands beside the maker) so the
guard survives non-cosmetic layout tweaks but still catches the original
regressions it was written for.
"""

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
    pattern = re.compile(
        r"addFurniture\(b, \{(?P<body>[^}]*?id: ['`]" + re.escape(furniture_id) + r"['`][^}]*?)\}\s*(?:,\s*false)?\);",
        re.S,
    )
    match = pattern.search(source)
    return match.group("body") if match else ""


def find_garden_zone(source: str) -> str:
    """Return the literal of the central garden zone definition, or empty."""
    match = re.search(
        r"\{\s*id:\s*'(?:central-garden|garden-atrium)'[^}]*\}",
        source,
    )
    return match.group(0) if match else ""


def find_fountain_block(source: str) -> str:
    pattern = re.compile(
        r"addFurniture\(b, \{(?P<body>[^}]*?kind:\s*'fountain_tower'[^}]*?)\}\s*(?:,\s*false)?\);",
        re.S,
    )
    match = pattern.search(source)
    return match.group("body") if match else ""


def find_coffee_activity(source: str) -> str:
    match = re.search(
        r"\{\s*id:\s*'coffee-maker'[^}]*\}",
        source,
    )
    return match.group(0) if match else ""


def main() -> int:
    source = LAYOUT.read_text(encoding="utf-8")
    textures = TEXTURES.read_text(encoding="utf-8")
    types = TYPES.read_text(encoding="utf-8")
    renderer = RENDERER.read_text(encoding="utf-8")
    failures: list[str] = []

    require(
        re.search(r"WORKSHOP_ASSET_REV\s*=\s*'office-garden-v(\d+)'", textures) is not None,
        "asset cache-bust revision must use the office-garden-vN naming",
        failures,
    )
    require("'garden_bed'" in types and "'fountain_tower'" in types,
            "garden/fountain furniture kinds must be typed", failures)
    require("case 'garden_bed'" in renderer and "case 'fountain_tower'" in renderer,
            "Three.js renderer must map garden/fountain furniture textures", failures)
    require("makeWorkshopPropTexture('garden_bed')" in textures and "makeWorkshopPropTexture('fountain_tower')" in textures,
            "garden/fountain procedural textures must be created", failures)

    require(bool(find_garden_zone(source)),
            "layout must include a named central garden zone", failures)
    require("id: 'meeting-lounge'" in source and "label: 'Meeting Lounge'" in source and "floorVariant: 3" in source,
            "meeting lounge must use an indoor floor, not the garden grass tile", failures)
    require("const isStoneRing" in source and "return isStoneRing ? 8 : 4" in source,
            "central garden must use a paver transition ring before grass", failures)
    require("save_paver_variant(8" in (ROOT / "scripts" / "polish_workshop_sprite_details.py").read_text(encoding="utf-8"),
            "floor variant 8 must be a dedicated paver transition tile", failures)
    require("kind: 'fountain_tower'" in source,
            "layout must include a fountain tower", failures)
    require(bool(re.search(r"kind:\s*'garden_bed'", source)),
            "layout must include at least one garden bed", failures)

    fountain = find_fountain_block(source)
    require("w: 3" in fountain and "h: 3" in fountain,
            "fountain tower must be a 3x3 visual anchor", failures)
    require("blocking: true" in fountain,
            "fountain tower must block pathfinding through its footprint", failures)

    table = block_for_id(source, "meeting-table")
    require("blocking: true" in table, "meeting table must block its own footprint", failures)
    # The pushBlocked guard for the table's north edge prevents characters from
    # standing inside the sprite's visible footprint.
    require("pushBlocked(b, tableCol, tableRow - 1, 3, 1)" in source,
            "meeting table must reserve its north visual edge", failures)

    # Verify the coffee maker activity does not coincide with the maker's tile.
    coffee_block = re.search(
        r"addFurniture\(b, \{[^}]*kind:\s*'coffee'[^}]*?col:\s*(?P<col>\d+),\s*row:\s*(?P<row>\d+)[^}]*?\}\s*(?:,\s*false)?\);",
        source,
    )
    if coffee_block is None:
        failures.append("layout must include a coffee maker furniture instance")
    else:
        maker_col = int(coffee_block.group("col"))
        maker_row = int(coffee_block.group("row"))
        require("blocking: true" in coffee_block.group(0),
                "coffee maker must block its tile", failures)
        activity = find_coffee_activity(source)
        if not activity:
            failures.append("coffee-maker activity must exist so characters use the maker")
        else:
            act_col_match = re.search(r"col:\s*(\d+)", activity)
            act_row_match = re.search(r"row:\s*(\d+)", activity)
            act_col = int(act_col_match.group(1)) if act_col_match else -1
            act_row = int(act_row_match.group(1)) if act_row_match else -1
            same_tile = (act_col, act_row) == (maker_col, maker_row)
            adjacent = abs(act_col - maker_col) + abs(act_row - maker_row) == 1
            require(not same_tile and adjacent,
                    "coffee activity must stand beside the maker instead of inside it", failures)

    # PC seat collision invariants — top desk PCs are 'back' variant and block,
    # bottom desk PCs are 'front' variant and share the chair tile so the
    # character can walk into the seat.
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

    # Reception PC: there is exactly one front-facing reception PC, and it must
    # be a blocking instance.
    reception_pc = re.search(
        r"addFurniture\(b, \{[^}]*id:\s*`pc-\$\{seatId\}`[^}]*variant:\s*'front'[^}]*?\}\);[\s\S]*?addReceptionDesk",
        source,
    )
    # Fallback: scan addReceptionDesk for an explicit reception PC.
    reception_section = re.search(r"function addReceptionDesk[\s\S]*?\n\}", source)
    if reception_section is not None:
        rs = reception_section.group(0)
        rec_pc_block = re.search(
            r"addFurniture\(b, \{[^}]*kind:\s*'pc'[^}]*?\}\s*(?:,\s*false)?\);",
            rs,
        )
        if rec_pc_block is None:
            failures.append("reception PC must exist in addReceptionDesk")
        else:
            require("blocking: true" in rec_pc_block.group(0),
                    "reception front PC must be blocking", failures)

    if failures:
        raise SystemExit("\n".join(failures))
    print("validated Workshop office/garden layout guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
