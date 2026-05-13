#!/usr/bin/env python3
"""Apply small, deterministic Workshop sprite detail passes.

The checked-in assets start from the MIT pixel-agents pack, then this script
adds Workshop-specific clarity fixes that are easier to review than hand-edited
binary PNG diffs. Keep the pass conservative: preserve dimensions, palette
identity, nearest-neighbor pixel art, and transparency.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Iterable

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "dashboard" / "public" / "assets"
CHAR_DIR = ASSETS / "characters"
ARTIFACTS = ROOT / "artifacts"

FRAME_W = 16
FRAME_H = 32
SOURCE_FRAMES_PER_DIR = 7
CHAR_FRAMES_PER_DIR = 10
SIDE_ROW_Y = FRAME_H * 2
TRANSPARENT = (0, 0, 0, 0)

Color = tuple[int, int, int, int]
Point = tuple[int, int]


def opaque_pixels(img: Image.Image, box: tuple[int, int, int, int] | None = None) -> list[Color]:
    crop = img.crop(box) if box else img
    return [p for p in crop.convert("RGBA").getdata() if p[3] > 0]


def luma(c: Color) -> float:
    return c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114


def dominant(colors: Iterable[Color], fallback: Color) -> Color:
    counted = Counter(colors)
    return counted.most_common(1)[0][0] if counted else fallback


def pick_palette(sheet: Image.Image) -> dict[str, Color]:
    outline = min(opaque_pixels(sheet), key=luma)
    # Sample palette from the original front/up rows, not the generated side
    # row, so repeated runs remain stable and do not learn prop colors.
    head = opaque_pixels(sheet, (0, 4, sheet.width, FRAME_H + 17))
    body = opaque_pixels(sheet, (0, 17, sheet.width, FRAME_H + 27))
    legs = opaque_pixels(sheet, (0, 24, sheet.width, FRAME_H + 32))

    bright_head = [c for c in head if luma(c) > 95 and c != outline]
    skin = max(bright_head or head or [outline], key=luma)
    hair_candidates = [c for c in head if c != outline and luma(c) < luma(skin) - 12]
    hair = dominant(hair_candidates, dominant(head, outline))
    cloth_candidates = [c for c in body if c != outline and c != skin and c != hair]
    cloth = dominant(cloth_candidates, dominant(body, outline))
    pants_candidates = [c for c in legs if c != outline and c != skin]
    pants = dominant(pants_candidates, cloth)
    shade = dominant([c for c in body if c != outline and luma(c) < luma(cloth)], outline)
    hair_highlight = max([c for c in head if c != outline and c != hair] or [hair], key=luma)
    return {
        "outline": outline,
        "skin": skin,
        "hair": hair,
        "cloth": cloth,
        "shade": shade,
        "pants": pants,
        "hair_highlight": hair_highlight,
        "paper": (238, 226, 190, 255),
        "screen": (74, 168, 190, 255),
    }


def set_many(pix, points: Iterable[Point], color: Color) -> None:
    for x, y in points:
        if 0 <= x < FRAME_W and 0 <= y < FRAME_H:
            pix[x, y] = color


def rect(pix, x0: int, y0: int, x1: int, y1: int, color: Color) -> None:
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < FRAME_W and 0 <= y < FRAME_H:
                pix[x, y] = color


def clear_side_profile(frame: Image.Image) -> Image.Image:
    out = Image.new("RGBA", (FRAME_W, FRAME_H), TRANSPARENT)
    # Preserve a few original lower-body pixels as a soft shadow reference.
    src = frame.convert("RGBA")
    for y in range(27, 31):
        for x in range(4, 12):
            px = src.getpixel((x, y))
            if px[3] > 0 and luma(px) < 80:
                out.putpixel((x, y), px)
    return out


def draw_side_frame(frame: Image.Image, pal: dict[str, Color], frame_index: int) -> Image.Image:
    out = clear_side_profile(frame)
    pix = out.load()
    o = pal["outline"]
    hair = pal["hair"]
    skin = pal["skin"]
    cloth = pal["cloth"]
    shade = pal["shade"]
    pants = pal["pants"]

    # Right-facing profile head: one eye, visible nose, and asymmetric hair mass.
    set_many(pix, [(6, 4), (7, 4), (8, 4), (9, 4), (5, 5), (10, 5), (4, 6), (11, 6), (3, 7), (12, 7), (3, 8), (13, 8), (3, 9), (14, 9), (4, 13), (12, 13), (5, 14), (11, 14)], o)
    rect(pix, 5, 5, 10, 7, hair)
    rect(pix, 4, 7, 7, 12, hair)
    set_many(pix, [(8, 7), (9, 7), (10, 8), (11, 8), (8, 9), (9, 9), (10, 9), (11, 9), (12, 9), (8, 10), (9, 10), (10, 10), (11, 10), (12, 10), (13, 10), (7, 11), (8, 11), (9, 11), (10, 11), (11, 11), (12, 11), (7, 12), (8, 12), (9, 12), (10, 12), (11, 12)], skin)
    set_many(pix, [(11, 10), (13, 11)], o)
    set_many(pix, [(12, 11), (13, 10)], skin)
    rect(pix, 7, 14, 9, 16, skin)

    # Side torso: narrow profile instead of a front-facing rectangular jacket.
    set_many(pix, [(5, 16), (10, 16), (4, 17), (11, 17), (4, 18), (11, 18), (4, 19), (11, 19), (5, 24), (10, 24)], o)
    rect(pix, 5, 17, 9, 23, cloth)
    rect(pix, 5, 18, 6, 23, shade)
    set_many(pix, [(10, 18), (10, 19), (10, 20), (10, 21), (10, 22)], skin)
    set_many(pix, [(7, 13), (7, 14), (6, 15)], shade)
    if luma(hair) < 70:
        set_many(pix, [(5, 6), (4, 8), (5, 10)], pal["hair_highlight"])

    # Walk cycle leg silhouettes. Frames 3-6 reuse a settled stance for actions.
    if frame_index == 1:
        leg_a = [(6, 24), (6, 25), (5, 26), (5, 27), (4, 28), (4, 29)]
        leg_b = [(9, 24), (9, 25), (10, 26), (10, 27), (11, 28), (11, 29)]
    elif frame_index == 2:
        leg_a = [(6, 24), (6, 25), (7, 26), (7, 27), (8, 28), (8, 29)]
        leg_b = [(9, 24), (8, 25), (7, 26), (6, 27), (5, 28), (5, 29)]
    else:
        leg_a = [(6, 24), (6, 25), (6, 26), (6, 27), (5, 28), (5, 29)]
        leg_b = [(9, 24), (9, 25), (9, 26), (9, 27), (10, 28), (10, 29)]
    set_many(pix, leg_a + leg_b, pants)
    set_many(pix, [(x, y + 1) for x, y in leg_a[-2:] + leg_b[-2:]], o)
    set_many(pix, [(5, 24), (10, 24), (4, 29), (11, 29)], o)

    # Side action frames: typing has a small screen; reading has a paper/book.
    if frame_index == 9:
        rect(pix, 4, 22, 11, 25, shade)
        set_many(pix, [(3, 22), (12, 22), (3, 25), (12, 25), (5, 27), (9, 27)], o)
        return out
    if frame_index in (3, 4):
        # Side-view terminal: thin angled slab, not a front-facing rectangle.
        set_many(pix, [(12, 18), (13, 18), (14, 19), (13, 20), (12, 20)], pal["screen"])
        set_many(pix, [(11, 17), (12, 17), (13, 17), (15, 19), (12, 21), (13, 21)], o)
        set_many(pix, [(11, 19), (12, 20)], skin)
        if frame_index == 4:
            pix[13, 19] = (255, 230, 112, 255)
    elif frame_index in (5, 6):
        # Side-view paper/book: narrow profile with a visible page edge.
        set_many(pix, [(11, 18), (12, 18), (13, 19), (14, 20), (13, 21), (12, 21), (11, 20), (11, 19)], pal["paper"])
        set_many(pix, [(10, 18), (14, 19), (15, 20), (14, 21), (12, 22), (11, 21)], o)
        set_many(pix, [(10, 20), (11, 21)], skin)
        if frame_index == 6:
            pix[13, 20] = o
    elif frame_index == 7:
        set_many(pix, [(12, 18), (13, 18), (12, 19), (13, 19)], (124, 76, 43, 255))
        set_many(pix, [(11, 17), (14, 17), (11, 19), (14, 19), (12, 20), (13, 20)], o)
        set_many(pix, [(12, 15), (13, 14), (12, 13)], (224, 224, 210, 255))
    elif frame_index == 8:
        set_many(pix, [(12, 18), (13, 18), (14, 19), (12, 20), (13, 20)], (103, 188, 218, 255))
        set_many(pix, [(11, 17), (14, 17), (15, 19), (11, 21), (12, 21), (13, 21), (14, 21)], o)
        set_many(pix, [(12, 16), (14, 17), (13, 21), (14, 20)], (174, 225, 241, 255))
        set_many(pix, [(11, 19), (12, 20)], skin)

    return out



def draw_quarter_side_frame(base: Image.Image, pal: dict[str, Color], frame_index: int) -> Image.Image:
    """Turn the front/down frame into a conservative side frame.

    This keeps the exact character hair/body silhouette family from the front
    row and only adds small directional cues. A full redrawn profile drifted too
    far and made characters read like different creatures.
    """
    out = base.convert("RGBA").copy()
    pix = out.load()
    o = pal["outline"]
    skin = pal["skin"]
    hair = pal["hair"]
    shade = pal["shade"]
    pants = pal["pants"]

    # Face cue: one visible eye and a two-pixel nose/mouth on the facing side.
    # Keep it tiny so hair style and head size stay anchored to the front frame.
    for y in range(7, 13):
        for x in range(4, 9):
            if pix[x, y][3] > 0:
                pix[x, y] = skin
    if luma(hair) < 70:
        # Dark-haired sprites had bright front-view highlights that read like
        # animal eyes when reused in side motion. Collapse those pixels back
        # into the hair mass before drawing the single human eye cue.
        for y in range(4, 10):
            for x in range(4, 11):
                if pix[x, y][3] > 0 and luma(pix[x, y]) > 150:
                    pix[x, y] = hair
    set_many(pix, [(10, 10), (12, 11)], o)
    set_many(pix, [(11, 11), (12, 10)], skin)
    # Small facing-side hair edge. This uses the sampled hair color, so each
    # palette keeps its own hairstyle instead of adopting a generic profile.
    set_many(pix, [(4, 7), (4, 8), (5, 6), (5, 12)], hair)

    # Right-side arm/shoulder cue and a darker trailing torso edge.
    set_many(pix, [(11, 17), (11, 18), (11, 19), (10, 20)], shade)
    set_many(pix, [(12, 18), (12, 19)], skin)

    # Directional feet: retain the original front walk cadence but point toes
    # sideways so lateral movement no longer reads as a pure front walk.
    if frame_index % 3 == 1:
        set_many(pix, [(4, 29), (5, 29), (10, 30), (11, 30)], o)
        set_many(pix, [(5, 28), (10, 29)], pants)
    elif frame_index % 3 == 2:
        set_many(pix, [(5, 30), (6, 30), (9, 29), (10, 29)], o)
        set_many(pix, [(6, 29), (9, 28)], pants)
    else:
        set_many(pix, [(5, 29), (6, 29), (9, 29), (10, 29)], o)
    return out

def draw_front_action_frame(base: Image.Image, pal: dict[str, Color], frame_index: int, row: int) -> Image.Image:
    out = base.convert("RGBA").copy()
    pix = out.load()
    o = pal["outline"]
    skin = pal["skin"]
    shade = pal["shade"]
    if frame_index in (3, 4):  # typing / console work
        rect(pix, 5, 19, 12, 21, (54, 65, 78, 255))
        set_many(pix, [(4, 18), (5, 18), (12, 18), (13, 18), (4, 21), (13, 21), (6, 22), (11, 22)], o)
        set_many(pix, [(7, 19), (8, 19), (9, 19), (10, 19)], (74, 168, 190, 255))
        if frame_index == 4:
            pix[10, 20] = (255, 230, 112, 255)
        set_many(pix, [(4, 20), (13, 20)], skin)
    elif frame_index == 7:  # coffee
        rect(pix, 10, 18, 12, 20, (124, 76, 43, 255))
        set_many(pix, [(9, 18), (13, 18), (9, 20), (13, 20), (10, 21), (11, 21), (12, 21)], o)
        set_many(pix, [(8, 19), (9, 20)], skin)
    elif frame_index == 8:  # wash hands / water at a small basin
        rect(pix, 6, 19, 13, 22, (76, 91, 101, 255))
        set_many(pix, [(5, 18), (14, 18), (5, 22), (14, 22), (6, 23), (13, 23)], o)
        set_many(pix, [(7, 19), (8, 20), (10, 19), (11, 20), (12, 19)], (103, 188, 218, 255))
        set_many(pix, [(8, 17), (9, 16), (10, 17), (8, 21), (12, 21)], (174, 225, 241, 255))
        set_many(pix, [(7, 18), (12, 18)], skin)
    elif frame_index == 9:  # seated/resting pose: lower body tucked behind chair/desk
        for y in range(24, 31):
            for x in range(4, 12):
                if pix[x, y][3] > 0:
                    pix[x, y] = TRANSPARENT
        rect(pix, 4, 23, 11, 26, shade)
        set_many(pix, [(3, 23), (12, 23), (3, 26), (12, 26), (5, 28), (10, 28)], o)
    if row == 1 and frame_index in (7, 8):
        # Back-facing versions keep the prop slightly higher, as if used at a counter.
        set_many(pix, [(7, 16), (8, 16), (9, 16)], skin)
    return out



CHARACTER_PALETTES: list[dict[str, Color]] = [
    {"skin": (232, 178, 132, 255), "hair": (92, 54, 35, 255), "hair2": (124, 76, 47, 255), "cloth": (58, 116, 166, 255), "pants": (45, 58, 82, 255)},
    {"skin": (210, 151, 105, 255), "hair": (62, 43, 31, 255), "hair2": (92, 67, 43, 255), "cloth": (153, 87, 61, 255), "pants": (52, 63, 73, 255)},
    {"skin": (238, 190, 145, 255), "hair": (33, 31, 35, 255), "hair2": (68, 60, 62, 255), "cloth": (64, 142, 112, 255), "pants": (50, 60, 78, 255)},
    {"skin": (196, 134, 94, 255), "hair": (41, 34, 30, 255), "hair2": (72, 54, 40, 255), "cloth": (122, 88, 160, 255), "pants": (43, 52, 70, 255)},
    {"skin": (236, 181, 128, 255), "hair": (154, 104, 49, 255), "hair2": (202, 147, 71, 255), "cloth": (186, 96, 72, 255), "pants": (62, 71, 88, 255)},
    {"skin": (226, 166, 118, 255), "hair": (28, 28, 32, 255), "hair2": (62, 62, 68, 255), "cloth": (76, 111, 184, 255), "pants": (39, 45, 62, 255)},
]


def draw_human_frame(pal: dict[str, Color], row: int, frame_index: int) -> Image.Image:
    img = Image.new("RGBA", (FRAME_W, FRAME_H), TRANSPARENT)
    pix = img.load()
    o = (38, 28, 32, 255)
    skin = pal["skin"]
    hair = pal["hair"]
    hair2 = pal["hair2"]
    cloth = pal["cloth"]
    pants = pal["pants"]
    shade = tuple(max(0, int(c * 0.72)) for c in cloth[:3]) + (255,)
    shoe = (34, 31, 35, 255)

    # Fuller 16x32 proportions: deliberately chibi and closer to the original
    # pixel-agents mass. Keep front/back/side on the same head/body footprint.
    set_many(pix, [(4, 2), (5, 1), (6, 1), (7, 1), (8, 1), (9, 1), (10, 1), (11, 2), (3, 3), (12, 3), (2, 5), (13, 5), (2, 10), (13, 10), (3, 13), (12, 13), (4, 14), (11, 14)], o)
    rect(pix, 3, 4, 12, 12, skin)
    rect(pix, 4, 3, 11, 5, hair)
    set_many(pix, [(3, 3), (4, 2), (5, 2), (6, 2), (7, 2), (8, 2), (9, 2), (10, 2), (11, 3), (2, 6), (2, 7), (3, 5), (12, 5)], hair)
    set_many(pix, [(5, 3), (9, 3), (10, 3), (11, 4)], hair2)

    if row == 0:
        set_many(pix, [(5, 8), (10, 8)], o)
        set_many(pix, [(7, 12), (8, 12), (9, 12)], o)
    elif row == 1:
        rect(pix, 3, 4, 12, 9, hair)
        set_many(pix, [(5, 3), (9, 3), (11, 6), (3, 8)], hair2)
        set_many(pix, [(4, 10), (5, 10), (6, 10), (7, 10), (8, 10), (9, 10), (10, 10), (11, 10)], skin)
    else:
        rect(pix, 3, 4, 8, 9, hair)
        set_many(pix, [(10, 8), (13, 9)], o)
        set_many(pix, [(9, 9), (10, 9), (11, 8), (12, 8), (11, 10), (8, 10)], skin)
        set_many(pix, [(4, 5), (5, 4), (6, 4)], hair2)

    rect(pix, 6, 14, 9, 16, skin)
    set_many(pix, [(2, 15), (13, 15), (1, 16), (14, 16), (1, 23), (14, 23), (2, 24), (13, 24)], o)
    rect(pix, 2, 16, 13, 23, cloth)
    rect(pix, 2, 19, 5, 23, shade)
    rect(pix, 10, 19, 13, 23, shade)
    if row == 2:
        set_many(pix, [(13, 18), (13, 19), (12, 20), (12, 21), (11, 22)], skin)
    else:
        set_many(pix, [(1, 18), (14, 18), (1, 19), (14, 19), (2, 20), (13, 20)], skin)

    if frame_index % 4 == 1:
        left = [(4, 24), (5, 24), (4, 25), (5, 25), (3, 26), (4, 26), (3, 27), (4, 27), (2, 28), (3, 28)]
        right = [(10, 24), (11, 24), (10, 25), (11, 25), (11, 26), (12, 26), (11, 27), (12, 27), (12, 28), (13, 28)]
    elif frame_index % 4 == 2:
        left = [(4, 24), (5, 24), (5, 25), (6, 25), (5, 26), (6, 26), (6, 27), (7, 27), (6, 28), (7, 28)]
        right = [(10, 24), (11, 24), (9, 25), (10, 25), (9, 26), (10, 26), (8, 27), (9, 27), (8, 28), (9, 28)]
    else:
        left = [(4, 24), (5, 24), (4, 25), (5, 25), (4, 26), (5, 26), (4, 27), (5, 27), (3, 28), (4, 28)]
        right = [(10, 24), (11, 24), (10, 25), (11, 25), (10, 26), (11, 26), (10, 27), (11, 27), (11, 28), (12, 28)]
    set_many(pix, left + right, pants)
    set_many(pix, [(2, 29), (3, 29), (4, 29), (5, 29), (10, 29), (11, 29), (12, 29), (13, 29)], shoe)
    set_many(pix, [(3, 28), (12, 28)], o)

    return img

def compose_action_frame(base: Image.Image, pal: dict[str, Color], frame_index: int, row: int) -> Image.Image:
    img = base.copy()
    if frame_index in (3, 4, 7, 8, 9):
        img = draw_front_action_frame(img, {
            "outline": (38, 28, 32, 255),
            "skin": pal["skin"],
            "hair": pal["hair"],
            "cloth": pal["cloth"],
            "shade": tuple(max(0, int(c * 0.72)) for c in pal["cloth"][:3]) + (255,),
            "pants": pal["pants"],
            "hair_highlight": pal["hair2"],
            "paper": (238, 226, 190, 255),
            "screen": (74, 168, 190, 255),
        }, frame_index, row)
    return img

def polish_character_sheet(path: Path) -> None:
    try:
        idx = int(path.stem.split("_")[-1])
    except ValueError:
        idx = 0
    pal = CHARACTER_PALETTES[idx % len(CHARACTER_PALETTES)]
    sheet = Image.new("RGBA", (FRAME_W * CHAR_FRAMES_PER_DIR, FRAME_H * 3), TRANSPARENT)
    for frame_index in range(CHAR_FRAMES_PER_DIR):
        source_frame = frame_index if frame_index < SOURCE_FRAMES_PER_DIR else 0
        for row in range(3):
            base = draw_human_frame(pal, row, source_frame)
            frame = compose_action_frame(base, pal, frame_index, row)
            sheet.alpha_composite(frame, (frame_index * FRAME_W, row * FRAME_H))
    sheet.save(path)


def draw_px_sprite(size: tuple[int, int], pixels: dict[Point, Color], output: Path) -> None:
    img = Image.new("RGBA", size, TRANSPARENT)
    pix = img.load()
    for (x, y), color in pixels.items():
        if 0 <= x < size[0] and 0 <= y < size[1]:
            pix[x, y] = color
    output.parent.mkdir(parents=True, exist_ok=True)
    img.save(output)


def add_rect(pixels: dict[Point, Color], x0: int, y0: int, x1: int, y1: int, color: Color) -> None:
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            pixels[(x, y)] = color


def polish_furniture_details() -> None:
    wood = (143, 100, 57, 255)
    wood_dark = (87, 53, 26, 255)
    wood_light = (177, 134, 73, 255)
    outline = (50, 25, 29, 255)
    screen = (74, 168, 190, 255)
    screen_dark = (18, 47, 72, 255)
    metal = (73, 62, 56, 255)
    pot = (126, 75, 41, 255)
    pot_dark = (67, 36, 21, 255)
    pot_light = (190, 119, 67, 255)

    # Side desk: explicit slab thickness, legs, underside shadow, and grain.
    px: dict[Point, Color] = {}
    add_rect(px, 2, 2, 13, 8, outline)
    add_rect(px, 3, 3, 12, 6, wood_light)
    add_rect(px, 3, 7, 12, 8, wood_dark)
    for y in range(9, 58):
        px[(3, y)] = outline
        px[(4, y)] = wood_dark
        px[(11, y)] = wood
        px[(12, y)] = outline
    for y in range(14, 54, 10):
        px[(5, y)] = wood_light
        px[(10, y)] = wood_dark
    add_rect(px, 2, 58, 5, 61, outline)
    add_rect(px, 10, 58, 13, 61, outline)
    draw_px_sprite((16, 64), px, ASSETS / "furniture" / "DESK" / "DESK_SIDE.png")

    # Small table side: same language as desk, but lighter and shorter.
    px = {}
    add_rect(px, 2, 2, 13, 8, outline)
    add_rect(px, 3, 3, 12, 6, wood_light)
    add_rect(px, 3, 7, 12, 8, wood_dark)
    for y in range(9, 40):
        px[(4, y)] = outline
        px[(5, y)] = wood
        px[(10, y)] = wood_dark
        px[(11, y)] = outline
    add_rect(px, 3, 40, 6, 43, outline)
    add_rect(px, 9, 40, 12, 43, outline)
    draw_px_sprite((16, 48), px, ASSETS / "furniture" / "SMALL_TABLE" / "SMALL_TABLE_SIDE.png")

    # Side computer: monitor thickness, lit screen face, stand, and keyboard plane.
    px = {}
    add_rect(px, 4, 2, 11, 15, outline)
    add_rect(px, 5, 3, 10, 12, screen_dark)
    add_rect(px, 6, 4, 10, 8, screen)
    px[(9, 5)] = (140, 219, 230, 255)
    add_rect(px, 6, 16, 9, 20, metal)
    add_rect(px, 5, 21, 10, 22, outline)
    add_rect(px, 3, 23, 12, 26, outline)
    add_rect(px, 4, 23, 11, 24, (96, 83, 76, 255))
    add_rect(px, 6, 27, 9, 29, outline)
    draw_px_sprite((16, 32), px, ASSETS / "furniture" / "PC" / "PC_SIDE.png")

    # Coffee maker: exaggerated spout, carafe, handle, hot plate, and steam so
    # it reads clearly at 16x16 instead of as an abstract gray block.
    px = {}
    add_rect(px, 4, 2, 11, 4, outline)
    add_rect(px, 5, 3, 10, 4, metal)
    add_rect(px, 3, 5, 12, 11, outline)
    add_rect(px, 4, 5, 8, 10, (86, 96, 101, 255))
    add_rect(px, 9, 5, 11, 7, (196, 207, 202, 255))
    add_rect(px, 9, 8, 11, 10, (80, 50, 31, 255))
    add_rect(px, 12, 7, 14, 10, outline)
    add_rect(px, 13, 8, 13, 9, (196, 207, 202, 255))
    add_rect(px, 5, 12, 12, 13, outline)
    add_rect(px, 6, 12, 11, 12, (45, 35, 31, 255))
    add_rect(px, 2, 6, 3, 7, outline)
    px[(2, 8)] = (214, 214, 202, 255)
    for pt in [(6, 0), (9, 0), (7, 1), (10, 1)]:
        px[pt] = (218, 218, 202, 255)
    draw_px_sprite((16, 16), px, ASSETS / "furniture" / "COFFEE" / "COFFEE.png")

    # Pot: separate rim, belly, inner shadow, and small highlight.
    px = {}
    add_rect(px, 4, 3, 11, 5, outline)
    add_rect(px, 5, 3, 10, 4, pot_light)
    add_rect(px, 5, 5, 10, 5, pot_dark)
    add_rect(px, 3, 6, 12, 11, outline)
    add_rect(px, 4, 6, 11, 10, pot)
    add_rect(px, 5, 7, 6, 9, pot_light)
    add_rect(px, 10, 7, 11, 10, pot_dark)
    add_rect(px, 5, 12, 10, 13, outline)
    draw_px_sprite((16, 16), px, ASSETS / "furniture" / "POT" / "POT.png")



def texture_noise_color(base: Color, dx: int, dy: int, delta: int) -> Color:
    n = ((dx * 37 + dy * 57 + dx * dy * 11) % (delta * 2 + 1)) - delta
    return (max(0, min(255, base[0] + n)), max(0, min(255, base[1] + n)), max(0, min(255, base[2] + n)), base[3])


def save_floor_variant(index: int, base: Color, accent: Color, mode: str) -> None:
    img = Image.new("RGBA", (16, 16), base)
    pix = img.load()
    for y in range(16):
        for x in range(16):
            pix[x, y] = texture_noise_color(base, x + index * 5, y + index * 3, 4)
    if mode == "concrete":
        for x, y in [(3, 4), (11, 6), (6, 12), (14, 2)]:
            pix[x, y] = accent
            if x + 1 < 16:
                pix[x + 1, y] = texture_noise_color(accent, x, y, 8)
    elif mode == "epoxy":
        for y in (5, 11):
            for x in range(16):
                pix[x, y] = texture_noise_color(accent, x, y, 3)
        for x in (4, 12):
            pix[x, (x + index) % 16] = accent
    elif mode == "mat":
        for y in range(3, 13):
            for x in range(2, 14):
                if (x + y) % 5 == 0:
                    pix[x, y] = accent
        for x in range(2, 14):
            pix[x, 2] = pix[x, 13] = accent
        for y in range(2, 14):
            pix[1, y] = pix[14, y] = accent
    elif mode == "plate":
        for x in range(16):
            pix[x, 0] = pix[x, 15] = accent
        for y in range(16):
            pix[0, y] = pix[15, y] = accent
        for x, y in [(2, 2), (13, 2), (2, 13), (13, 13)]:
            pix[x, y] = (82, 80, 74, 255)
    img.save(ASSETS / "floors" / f"floor_{index}.png")


def polish_floor_and_wall_details() -> None:
    # Low-contrast office/workshop floor family: concrete, epoxy, mats, panels.
    floor_specs = [
        ((93, 96, 90, 255), (76, 78, 74, 255), "concrete"),
        ((104, 101, 91, 255), (123, 116, 98, 255), "concrete"),
        ((86, 98, 103, 255), (72, 86, 91, 255), "epoxy"),
        ((96, 86, 75, 255), (116, 101, 82, 255), "concrete"),
        ((76, 86, 80, 255), (94, 112, 103, 255), "mat"),
        ((104, 99, 86, 255), (82, 78, 70, 255), "plate"),
        ((88, 91, 97, 255), (69, 72, 78, 255), "plate"),
        ((79, 75, 70, 255), (103, 94, 80, 255), "mat"),
        ((98, 91, 80, 255), (133, 113, 72, 255), "epoxy"),
    ]
    for i, (base, accent, mode) in enumerate(floor_specs):
        save_floor_variant(i, base, accent, mode)

    # Horizontally seamless wall: neutral edges, internal panels, cap, shadow, conduit.
    img = Image.new("RGBA", (64, 128), (0, 0, 0, 0))
    pix = img.load()
    wall = (188, 178, 154, 255)
    wall_alt = (174, 166, 146, 255)
    cap = (215, 201, 171, 255)
    shadow = (91, 78, 66, 255)
    trim = (122, 96, 73, 255)
    dark = (55, 43, 38, 255)
    blue = (111, 144, 151, 255)
    for y in range(128):
        for x in range(64):
            if y < 12:
                c = cap
            elif y < 19:
                c = trim
            elif y < 103:
                c = wall if ((x // 8 + y // 16) % 2 == 0) else wall_alt
            elif y < 111:
                c = shadow
            else:
                c = (68, 58, 52, 255)
            pix[x, y] = texture_noise_color(c, x, y, 3)
    # Internal panels, deliberately away from x=0/63 so horizontal tiling stays clean.
    for x0, x1 in [(10, 25), (39, 54)]:
        for y in range(30, 76):
            pix[x0, y] = pix[x1, y] = trim
        for x in range(x0, x1 + 1):
            pix[x, 30] = trim
            pix[x, 76] = shadow
        for y in range(34, 70):
            for x in range(x0 + 2, x1 - 1):
                pix[x, y] = texture_noise_color(blue, x, y, 4)
        for x in range(x0 + 3, x1 - 2):
            pix[x, 36] = (164, 188, 188, 255)
    # Pegboard / conduit / small signage details.
    for y in range(35, 70, 8):
        for x in range(29, 36, 3):
            pix[x, y] = dark
    for x in range(28, 37):
        pix[x, 86] = dark
        pix[x, 87] = trim
    for y in range(22, 98):
        pix[32, y] = trim if y % 7 else dark
    for x in range(4, 60):
        pix[x, 18] = dark
        pix[x, 102] = dark
    # Match both horizontal edges exactly to avoid visible seams.
    for y in range(128):
        pix[0, y] = pix[63, y] = pix[1, y]
    img.save(ASSETS / "walls" / "wall_0.png")

def make_character_contact_sheet(output: Path) -> None:
    sheets = [Image.open(CHAR_DIR / f"char_{i}.png").convert("RGBA") for i in range(6)]
    scale = 6
    pad = 10
    label_h = 18
    cell_w = FRAME_W * CHAR_FRAMES_PER_DIR * scale
    cell_h = FRAME_H * 3 * scale + label_h
    out = Image.new("RGBA", (cell_w + pad * 2, cell_h * len(sheets) + pad * 2), (24, 24, 28, 255))
    from PIL import ImageDraw

    draw = ImageDraw.Draw(out)
    for i, sheet in enumerate(sheets):
        y = pad + i * cell_h
        draw.text((pad, y), f"char_{i} - down / up / right-profile", fill=(236, 232, 210, 255))
        preview = sheet.resize((cell_w, FRAME_H * 3 * scale), Image.Resampling.NEAREST)
        out.alpha_composite(preview, (pad, y + label_h))
        for row in range(3):
            for col in range(CHAR_FRAMES_PER_DIR):
                x0 = pad + col * FRAME_W * scale
                y0 = y + label_h + row * FRAME_H * scale
                draw.rectangle((x0, y0, x0 + FRAME_W * scale - 1, y0 + FRAME_H * scale - 1), outline=(255, 255, 255, 60))
    output.parent.mkdir(parents=True, exist_ok=True)
    out.save(output)


def main() -> int:
    for i in range(6):
        polish_character_sheet(CHAR_DIR / f"char_{i}.png")
    polish_furniture_details()
    polish_floor_and_wall_details()
    make_character_contact_sheet(ARTIFACTS / "workshop-character-detail-contact-sheet.png")
    print("polished characters, furniture, floor, and wall detail sprites")
    print(f"contact sheet: {ARTIFACTS / 'workshop-character-detail-contact-sheet.png'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
