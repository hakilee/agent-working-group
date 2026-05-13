#!/usr/bin/env python3
"""
Maintain the Workshop pixel sprite pack without accidentally degrading it.

The Workshop dashboard intentionally uses the polished MIT-licensed pixel-agents
asset pack as its baseline. This script used to procedurally regenerate rough
placeholder sprites; that made it too easy to overwrite the production-quality
art with crude generated art. It now validates the checked-in assets and can
optionally sync from a local pixel-agents checkout when an explicit source is
provided.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "dashboard" / "public" / "assets"
ARTIFACTS = ROOT / "artifacts"

POLISHED_ASSET_OVERRIDES = {
    # Workshop-specific detail pass layered on top of pixel-agents: true side
    # profile characters and clearer side-view office props.
    "characters/char_0.png",
    "characters/char_1.png",
    "characters/char_2.png",
    "characters/char_3.png",
    "characters/char_4.png",
    "characters/char_5.png",
    "furniture/DESK/DESK_SIDE.png",
    "furniture/PC/PC_SIDE.png",
    "furniture/POT/POT.png",
    "furniture/SMALL_TABLE/SMALL_TABLE_SIDE.png",
    "walls/wall_0.png",
    "floors/floor_0.png",
    "floors/floor_1.png",
    "floors/floor_2.png",
    "floors/floor_3.png",
    "floors/floor_4.png",
    "floors/floor_5.png",
    "floors/floor_6.png",
    "floors/floor_7.png",
    "floors/floor_8.png",
}

EXPECTED_DIMENSIONS = {
    "walls/wall_0.png": (64, 128),
    **{f"floors/floor_{i}.png": (16, 16) for i in range(9)},
    **{f"characters/char_{i}.png": (112, 96) for i in range(6)},
    "furniture/DESK/DESK_SIDE.png": (16, 64),
    "furniture/PC/PC_SIDE.png": (16, 32),
    "furniture/POT/POT.png": (16, 16),
    "furniture/SMALL_TABLE/SMALL_TABLE_SIDE.png": (16, 48),
}

REQUIRED_ASSETS = [
    "walls/wall_0.png",
    "floors/floor_0.png",
    "floors/floor_1.png",
    "floors/floor_2.png",
    "floors/floor_3.png",
    "floors/floor_4.png",
    "floors/floor_5.png",
    "floors/floor_6.png",
    "floors/floor_7.png",
    "floors/floor_8.png",
    "characters/char_0.png",
    "characters/char_1.png",
    "characters/char_2.png",
    "characters/char_3.png",
    "characters/char_4.png",
    "characters/char_5.png",
    "furniture/BIN/BIN.png",
    "furniture/BOOKSHELF/BOOKSHELF.png",
    "furniture/CACTUS/CACTUS.png",
    "furniture/CLOCK/CLOCK.png",
    "furniture/COFFEE/COFFEE.png",
    "furniture/COFFEE_TABLE/COFFEE_TABLE.png",
    "furniture/CUSHIONED_BENCH/CUSHIONED_BENCH.png",
    "furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_BACK.png",
    "furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png",
    "furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_SIDE.png",
    "furniture/DESK/DESK_FRONT.png",
    "furniture/DESK/DESK_SIDE.png",
    "furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png",
    "furniture/HANGING_PLANT/HANGING_PLANT.png",
    "furniture/LARGE_PAINTING/LARGE_PAINTING.png",
    "furniture/LARGE_PLANT/LARGE_PLANT.png",
    "furniture/PC/PC_BACK.png",
    "furniture/PC/PC_FRONT_OFF.png",
    "furniture/PC/PC_FRONT_ON_1.png",
    "furniture/PC/PC_FRONT_ON_2.png",
    "furniture/PC/PC_FRONT_ON_3.png",
    "furniture/PC/PC_SIDE.png",
    "furniture/PLANT/PLANT.png",
    "furniture/PLANT_2/PLANT_2.png",
    "furniture/POT/POT.png",
    "furniture/SMALL_PAINTING/SMALL_PAINTING.png",
    "furniture/SMALL_PAINTING_2/SMALL_PAINTING_2.png",
    "furniture/SMALL_TABLE/SMALL_TABLE_FRONT.png",
    "furniture/SMALL_TABLE/SMALL_TABLE_SIDE.png",
    "furniture/SOFA/SOFA_BACK.png",
    "furniture/SOFA/SOFA_FRONT.png",
    "furniture/SOFA/SOFA_SIDE.png",
    "furniture/TABLE_FRONT/TABLE_FRONT.png",
    "furniture/WHITEBOARD/WHITEBOARD.png",
    "furniture/WOODEN_BENCH/WOODEN_BENCH.png",
    "furniture/WOODEN_CHAIR/WOODEN_CHAIR_BACK.png",
    "furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png",
    "furniture/WOODEN_CHAIR/WOODEN_CHAIR_SIDE.png",
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def apply_workshop_polish() -> None:
    subprocess.run(
        [sys.executable, os.fspath(ROOT / "scripts" / "polish_workshop_sprite_details.py")],
        cwd=ROOT,
        check=True,
    )


def sync_from_pixel_agents(source_assets: Path) -> None:
    missing = [rel for rel in REQUIRED_ASSETS if not (source_assets / rel).exists()]
    if missing:
        raise SystemExit("source asset pack is missing required files:\n" + "\n".join(missing))

    for rel in REQUIRED_ASSETS:
        src = source_assets / rel
        dst = ASSETS / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def validate_assets(reference_assets: Path | None = None) -> list[str]:
    errors: list[str] = []
    for rel in REQUIRED_ASSETS:
        path = ASSETS / rel
        if not path.exists():
            errors.append(f"missing: {rel}")
            continue
        try:
            with Image.open(path) as image:
                image.verify()
        except Exception as exc:  # pragma: no cover - gives useful CLI diagnostics
            errors.append(f"invalid png: {rel}: {exc}")
            continue

        expected_size = EXPECTED_DIMENSIONS.get(rel)
        if expected_size is not None:
            with Image.open(path) as image:
                if image.size != expected_size:
                    errors.append(f"unexpected dimensions: {rel}: {image.size} != {expected_size}")

        if reference_assets is not None:
            ref = reference_assets / rel
            if not ref.exists():
                errors.append(f"missing reference: {rel}")
            elif rel not in POLISHED_ASSET_OVERRIDES and sha256(path) != sha256(ref):
                errors.append(f"differs from reference: {rel}")
    return errors


def make_contact_sheet(output: Path) -> None:
    files = [ASSETS / rel for rel in REQUIRED_ASSETS]
    thumb = 96
    label_h = 18
    cols = 8
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * thumb, rows * (thumb + label_h)), (24, 24, 28, 255))
    draw = ImageDraw.Draw(sheet)

    for index, path in enumerate(files):
        image = Image.open(path).convert("RGBA")
        scale = max(1, min((thumb - 16) // image.width, (thumb - 28) // image.height))
        preview = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
        cell_x = (index % cols) * thumb
        cell_y = (index // cols) * (thumb + label_h)
        sheet.alpha_composite(preview, (cell_x + (thumb - preview.width) // 2, cell_y + 6))
        draw.text((cell_x + 3, cell_y + thumb), path.stem[:14], fill=(230, 230, 220, 255))

    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sync-from",
        type=Path,
        help="Local pixel-agents webview-ui/public/assets directory to copy from.",
    )
    parser.add_argument(
        "--reference",
        type=Path,
        help="Optional asset directory to compare byte-for-byte against.",
    )
    parser.add_argument(
        "--contact-sheet",
        type=Path,
        default=ARTIFACTS / "workshop-sprite-contact-sheet.png",
        help="Preview sheet path to write after validation.",
    )
    args = parser.parse_args()

    if args.sync_from:
        sync_from_pixel_agents(args.sync_from)

    apply_workshop_polish()

    errors = validate_assets(args.reference)
    if errors:
        print("Workshop sprite asset validation failed:", file=sys.stderr)
        print("\n".join(errors), file=sys.stderr)
        return 1

    make_contact_sheet(args.contact_sheet)
    print(f"validated {len(REQUIRED_ASSETS)} Workshop pixel sprites")
    print(f"contact sheet: {os.fspath(args.contact_sheet)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
