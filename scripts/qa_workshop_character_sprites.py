#!/usr/bin/env python3
"""Pixel-level QA for Workshop character sprite sheets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHAR_DIR = ROOT / "dashboard" / "public" / "assets" / "characters"

FRAME_W = 16
FRAME_H = 32
FRAMES = 10
SOURCE_FRAMES = 7
ROWS = ("down", "up", "side")


def frame_bbox(frame: Image.Image) -> dict[str, int] | None:
    rgba = frame.convert("RGBA")
    pts = [(x, y) for y in range(FRAME_H) for x in range(FRAME_W) if rgba.getpixel((x, y))[3] > 0]
    if not pts:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return {
        "x0": min(xs),
        "x1": max(xs),
        "w": max(xs) - min(xs) + 1,
        "y0": min(ys),
        "y1": max(ys),
        "h": max(ys) - min(ys) + 1,
        "opaque": len(pts),
    }


def crop_frame(sheet: Image.Image, row: int, frame: int) -> Image.Image:
    return sheet.crop((frame * FRAME_W, row * FRAME_H, (frame + 1) * FRAME_W, (row + 1) * FRAME_H))


def same_visible_pixels(a: Image.Image, b: Image.Image) -> bool:
    """Compare only the visible RGBA pixels; transparent RGB is irrelevant."""
    a_data = list(a.convert("RGBA").getdata())
    b_data = list(b.convert("RGBA").getdata())
    for pa, pb in zip(a_data, b_data):
        if pa[3] == 0 and pb[3] == 0:
            continue
        if pa != pb:
            return False
    return True


def qa(reference: Path | None = None) -> dict[str, Any]:
    failures: list[str] = []
    sprites: list[dict[str, Any]] = []
    for idx in range(6):
        path = CHAR_DIR / f"char_{idx}.png"
        sheet = Image.open(path).convert("RGBA")
        if sheet.size != (FRAME_W * FRAMES, FRAME_H * len(ROWS)):
            failures.append(f"char_{idx}: expected 160x96, got {sheet.size}")
            continue
        ref = None
        if reference:
            ref_path = reference / "characters" / f"char_{idx}.png"
            ref = Image.open(ref_path).convert("RGBA") if ref_path.exists() else None
            if ref is None or ref.size != (FRAME_W * SOURCE_FRAMES, FRAME_H * len(ROWS)):
                failures.append(f"char_{idx}: missing or invalid reference sheet")
        row_metrics: dict[str, list[dict[str, int]]] = {}
        for row_i, row_name in enumerate(ROWS):
            row_metrics[row_name] = []
            for frame_i in range(FRAMES):
                frame = crop_frame(sheet, row_i, frame_i)
                bbox = frame_bbox(frame)
                if bbox is None:
                    failures.append(f"char_{idx} {row_name}[{frame_i}]: empty frame")
                    continue
                row_metrics[row_name].append({"frame": frame_i, **bbox})
                if bbox["w"] < 12 or bbox["h"] < 22:
                    failures.append(f"char_{idx} {row_name}[{frame_i}]: bbox too small {bbox['w']}x{bbox['h']}")
                if row_name == "side" and frame_i < SOURCE_FRAMES:
                    if bbox["opaque"] < 220:
                        failures.append(f"char_{idx} side[{frame_i}]: too sparse ({bbox['opaque']} opaque px)")
                    if ref is not None and not same_visible_pixels(frame, crop_frame(ref, row_i, frame_i)):
                        failures.append(f"char_{idx} side[{frame_i}]: no longer matches upstream side identity frame")
        # Identity/proportion guard: side source frames should be close to the
        # front/back silhouette, not a skinny generated creature.
        for frame_i in range(SOURCE_FRAMES):
            down = row_metrics["down"][frame_i]
            side = row_metrics["side"][frame_i]
            if side["w"] < down["w"] - 3:
                failures.append(f"char_{idx} side[{frame_i}]: width drift vs front ({side['w']} vs {down['w']})")
            if side["opaque"] < int(down["opaque"] * 0.70):
                failures.append(f"char_{idx} side[{frame_i}]: opaque area drift vs front ({side['opaque']} vs {down['opaque']})")
        sprites.append({"sprite": f"char_{idx}.png", "rows": row_metrics})
    return {"ok": not failures, "failures": failures, "sprites": sprites}


def write_markdown(result: dict[str, Any], output: Path) -> None:
    lines = ["# Workshop Character Sprite Pixel QA", "", f"Result: {'PASS' if result['ok'] else 'FAIL'}", ""]
    if result["failures"]:
        lines += ["## Failures", ""] + [f"- {f}" for f in result["failures"]] + [""]
    lines += ["## Per-Sprite Metrics", ""]
    for sprite in result["sprites"]:
        lines.append(f"### {sprite['sprite']}")
        for row_name, frames in sprite["rows"].items():
            compact = ", ".join(
                f"{f['frame']}:{f['w']}x{f['h']}/{f['opaque']}px" for f in frames
            )
            lines.append(f"- {row_name}: {compact}")
        lines.append("")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--json", type=Path)
    parser.add_argument("--markdown", type=Path)
    args = parser.parse_args()
    result = qa(args.reference)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    if args.markdown:
        write_markdown(result, args.markdown)
    if not result["ok"]:
        raise SystemExit("\n".join(result["failures"]))
    print("validated Workshop character sprites pixel-by-pixel")


if __name__ == "__main__":
    main()
