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
PAGE = ROOT / "dashboard" / "src" / "pages" / "workshop.tsx"


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


def find_plaza_planter_block(source: str) -> str:
    pattern = re.compile(
        r"addFurniture\(b, \{(?P<body>[^}]*?kind:\s*'plaza_planter'[^}]*?)\}\s*(?:,\s*false)?\);",
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
    page = PAGE.read_text(encoding="utf-8")
    failures: list[str] = []

    require(
        re.search(r"WORKSHOP_ASSET_REV\s*=\s*'(?:office-garden-v\d+|gather-office-v\d+)'", textures) is not None,
        "asset cache-bust revision must use a recognized Workshop cache-bust naming scheme",
        failures,
    )
    require("'garden_bed'" in types and "'plaza_planter'" in types and "'window_panel'" in types,
            "Gather-style garden/window furniture kinds must be typed", failures)
    require("case 'garden_bed'" in renderer and "case 'plaza_planter'" in renderer and "case 'window_panel'" in renderer,
            "Three.js renderer must map Gather-style furniture textures", failures)
    require("makeGatherPropTexture('garden_bed')" in textures and "makeGatherPropTexture('plaza_planter')" in textures and "makeGatherPropTexture('window_panel')" in textures,
            "Gather-style procedural textures must be created", failures)
    require("CAMERA_ROOM_TOUR_ORDER" not in page and "CAMERA_TOUR_INTERVAL_MS" not in page,
            "Workshop camera must not auto-tour rooms while agents are idle", failures)
    require("const lead = chars.find((c) => c.role === 'lead')" in page,
            "Workshop camera must keep a stable lead/agent focus instead of falling back to map center", failures)

    require(bool(find_garden_zone(source)),
            "layout must include a named central garden zone", failures)
    require("id: 'meeting-lounge'" in source and "label: 'Meeting Lounge'" in source and "floorVariant: 6" in source,
            "meeting lounge must use a cohesive Gather-like floor variant", failures)
    require("return isPathEdge ? 0 : 2" in source,
            "central courtyard must use subtle office tiles instead of noisy grass/fountain flooring", failures)
    require("return isStoneRing ? 8 : 4" not in source,
            "central courtyard must not keep the old grass-and-paver fountain treatment", failures)
    require("kind: 'fountain_tower'" not in source and "central-fountain" not in source,
            "central fountain must be removed from the Gather-style courtyard", failures)
    require(bool(re.search(r"kind:\s*'garden_bed'", source)),
            "layout must include at least one garden bed", failures)
    require(bool(re.search(r"kind:\s*'window_panel'", source)),
            "layout must use Gather-style repeated window panels", failures)

    plaza_planter = find_plaza_planter_block(source)
    require("w: 3" in plaza_planter and "h: 2" in plaza_planter,
            "central courtyard must use a 3x2 planter island instead of a fountain", failures)
    require("blocking: true" in plaza_planter,
            "central planter island must block pathfinding through its footprint", failures)

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
