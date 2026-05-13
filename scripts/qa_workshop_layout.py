#!/usr/bin/env python3
"""Static QA guard for Workshop furniture collision/readability regressions."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAYOUT = ROOT / "dashboard" / "src" / "workshop" / "engine" / "office-layout.ts"
TEXTURES = ROOT / "dashboard" / "src" / "workshop" / "three" / "textures.ts"


def require(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def block_for_id(source: str, furniture_id: str) -> str:
    pattern = re.compile(r"addFurniture\(b, \{(?P<body>.*?id: ['`]" + re.escape(furniture_id) + r"['`].*?)\}\s*(?:,\s*false)?\);", re.S)
    match = pattern.search(source)
    if not match:
        return ""
    return match.group("body")


def main() -> int:
    source = LAYOUT.read_text(encoding="utf-8")
    textures = TEXTURES.read_text(encoding="utf-8")
    failures: list[str] = []

    require("WORKSHOP_ASSET_REV = 'sprite-identity-collision-v2'" in textures,
            "asset cache-bust revision was not updated for identity/collision sprites", failures)

    table = block_for_id(source, "meeting-table")
    require("blocking: true" in table, "meeting table must block its own footprint", failures)
    require("pushBlocked(b, tableCol, tableRow - 1, 3, 1)" in source,
            "meeting table must reserve its north visual edge", failures)
    require("{ col: 19, row: 5 }" not in source and "{ col: 20, row: 5 }" not in source and "{ col: 21, row: 5 }" not in source,
            "meeting spots must not place agents on the table's blocked north edge", failures)

    coffee = block_for_id(source, "lounge-coffee-maker")
    require("blocking: true" in coffee, "coffee maker must block its tile", failures)
    require("id: 'coffee-maker'" in source and "col: 25, row: 19" in source and "facingDir: Direction.LEFT" in source,
            "coffee activity must stand beside the maker instead of inside it", failures)

    pc_blocks = [m.group(0) for m in re.finditer(r"id: `pc-\$\{seatId\}`.*?\}\s*(?:,\s*false)?\);", source, re.S)]
    focus_top_pcs = [block for block in pc_blocks if "variant: 'back'" in block]
    focus_bottom_pcs = [block for block in pc_blocks if "variant: 'front'" in block and "FOCUS_BOTTOM_DESK_ROW" in block]
    reception_pcs = [block for block in pc_blocks if "variant: 'front'" in block and "deskRow - 1" in block]
    require(focus_top_pcs and all("blocking: true" in block and "}, false" not in block for block in focus_top_pcs),
            "focus top/back PCs must be blocking", failures)
    require(focus_bottom_pcs and all("blocking: false" in block and "}, false" in block for block in focus_bottom_pcs),
            "focus bottom PCs share the chair tile and must remain non-blocking", failures)
    require(reception_pcs and all("blocking: true" in block and "}, false" not in block for block in reception_pcs),
            "reception front PC must be blocking", failures)

    if failures:
        raise SystemExit("\n".join(failures))
    print("validated Workshop layout collision guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
