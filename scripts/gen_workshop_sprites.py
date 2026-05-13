#!/usr/bin/env python3
"""
Generate Japanese 1990s office pixel-art sprite set for the Workshop dashboard.

Outputs into dashboard/public/assets/ using existing filename conventions so the
engine sprite loader picks them up without changes.

Style:
  - 16px tile grid; pixel-perfect (no anti-aliasing).
  - Cohesive 1990s salaryman palette: warm fluorescents + cool gray-blues +
    navy/charcoal suits + filing-cabinet metallics + Japanese terra-cotta/jade
    accents on plants and wall art.
  - Consistent top-left light source.
  - All sprites on transparent backgrounds.
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "dashboard", "public", "assets")

# ─── Cohesive 32-color Japanese-office palette ────────────────────────────────
TRANSPARENT = (0, 0, 0, 0)
OUTLINE = (20, 22, 28, 255)
DEEP_SHADOW = (32, 36, 44, 255)

# Carpet (focus room) — gray-blue worn loop pile
CARPET_BASE = (95, 105, 118, 255)
CARPET_DARK = (75, 85, 98, 255)
CARPET_LITE = (118, 130, 142, 255)
CARPET_FLECK = (140, 150, 160, 255)

# Carpet beige (hallway/reception)
CARPET_BEIGE = (160, 145, 110, 255)
CARPET_BEIGE_DK = (130, 115, 82, 255)
CARPET_BEIGE_LT = (188, 172, 138, 255)

# Linoleum (meeting room / aisles)
LINO_BASE = (208, 192, 156, 255)
LINO_DARK = (172, 156, 120, 255)
LINO_LITE = (230, 216, 184, 255)

# Raised floor (ops center) — perforated metal panels
RAISED_BASE = (108, 112, 118, 255)
RAISED_DARK = (78, 82, 88, 255)
RAISED_HOLE = (40, 44, 50, 255)

# Tatami / wood (lounge)
TATAMI_BASE = (190, 158, 105, 255)
TATAMI_DARK = (152, 122, 78, 255)
TATAMI_LITE = (212, 184, 130, 255)
TATAMI_BIND = (90, 70, 45, 255)

# Bathroom tile
BTILE_BASE = (228, 226, 218, 255)
BTILE_GROUT = (180, 178, 170, 255)
BTILE_SHEEN = (244, 242, 234, 255)

# Genkan stone
GENKAN_BASE = (140, 130, 116, 255)
GENKAN_DARK = (104, 96, 84, 255)
GENKAN_LITE = (172, 162, 146, 255)

# Smoking corner concrete
CONCRETE_BASE = (118, 116, 110, 255)
CONCRETE_DARK = (92, 90, 84, 255)
CONCRETE_LITE = (140, 138, 132, 255)

# Wall cream
WALL_BASE = (216, 206, 166, 255)
WALL_SHADOW = (168, 156, 112, 255)
WALL_HI = (232, 222, 192, 255)
WALL_TRIM = (95, 80, 50, 255)  # baseboard

# Metal (desk frame, filing cabinets, vending body)
METAL_BASE = (138, 138, 142, 255)
METAL_DARK = (88, 88, 94, 255)
METAL_LITE = (180, 180, 184, 255)
METAL_BLACK = (44, 46, 52, 255)

# Wood top (laminate desk surface, meeting table)
WOOD_BASE = (184, 152, 104, 255)
WOOD_DARK = (140, 112, 70, 255)
WOOD_LITE = (212, 180, 132, 255)

# CRT
CRT_BEZEL = (210, 200, 168, 255)
CRT_BEZEL_DK = (160, 150, 120, 255)
CRT_SCREEN = (18, 28, 22, 255)
CRT_GLOW = (62, 132, 96, 255)

# Plants
LEAF_DK = (38, 90, 56, 255)
LEAF_BASE = (60, 124, 78, 255)
LEAF_LT = (96, 164, 108, 255)
POT_BASE = (164, 92, 56, 255)
POT_DARK = (122, 64, 38, 255)
POT_LITE = (196, 124, 84, 255)
POT_BLUE = (74, 96, 124, 255)  # ceramic pot variant
POT_BLUE_DK = (50, 70, 92, 255)
POT_BLUE_LT = (108, 130, 158, 255)

# Suit (salaryman)
SUIT_DK = (28, 32, 48, 255)
SUIT_BASE = (44, 48, 64, 255)
SUIT_LT = (62, 66, 84, 255)
SUIT_BTN = (90, 95, 112, 255)

# Female blazer (worker)
BLAZ_DK = (28, 36, 60, 255)
BLAZ_BASE = (44, 56, 84, 255)
BLAZ_LT = (66, 80, 110, 255)

# Skin
SKIN_DK = (188, 142, 110, 255)
SKIN_BASE = (224, 184, 148, 255)
SKIN_LT = (240, 208, 178, 255)

# Hair (dark)
HAIR_DK = (28, 24, 28, 255)
HAIR_BASE = (52, 44, 50, 255)
HAIR_LT = (84, 72, 78, 255)

# Hair brown (variant)
HAIR_BR_DK = (60, 40, 28, 255)
HAIR_BR = (96, 68, 46, 255)
HAIR_BR_LT = (132, 100, 70, 255)

# Shirt white
SHIRT_WT = (236, 234, 220, 255)
SHIRT_WT_SH = (192, 188, 168, 255)

# Tie (red/maroon for lead)
TIE_RED_DK = (96, 30, 36, 255)
TIE_RED = (148, 48, 56, 255)

# Tie / scarf navy
TIE_NV = (60, 80, 124, 255)

# Glass / mirror
GLASS_BASE = (148, 178, 196, 255)
GLASS_DK = (102, 132, 156, 255)
GLASS_LT = (200, 220, 232, 255)

# Smoke / steam
SMOKE_LT = (220, 222, 224, 180)
SMOKE_MD = (190, 192, 196, 150)
SMOKE_DK = (160, 162, 168, 110)

# Accent — Japanese red / jade for paintings
PAINT_RED = (172, 56, 50, 255)
PAINT_JADE = (74, 132, 110, 255)
PAINT_GOLD = (208, 168, 96, 255)
PAINT_INK = (32, 28, 28, 255)


def _ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)


def _new(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), TRANSPARENT)


def _save(img: Image.Image, *parts: str) -> None:
    p = os.path.join(ASSETS, *parts)
    _ensure_dir(os.path.dirname(p))
    img.save(p, optimize=True)


def _put(px, x: int, y: int, c, w: int, h: int) -> None:
    if 0 <= x < w and 0 <= y < h:
        px[x, y] = c


def _hline(px, x0: int, x1: int, y: int, c, w: int, h: int) -> None:
    for x in range(min(x0, x1), max(x0, x1) + 1):
        _put(px, x, y, c, w, h)


def _vline(px, x: int, y0: int, y1: int, c, w: int, h: int) -> None:
    for y in range(min(y0, y1), max(y0, y1) + 1):
        _put(px, x, y, c, w, h)


def _rect(px, x0: int, y0: int, x1: int, y1: int, c, w: int, h: int) -> None:
    for y in range(min(y0, y1), max(y0, y1) + 1):
        for x in range(min(x0, x1), max(x0, x1) + 1):
            _put(px, x, y, c, w, h)


def _box(px, x0: int, y0: int, x1: int, y1: int, fill, outline, w: int, h: int) -> None:
    _rect(px, x0, y0, x1, y1, fill, w, h)
    _hline(px, x0, x1, y0, outline, w, h)
    _hline(px, x0, x1, y1, outline, w, h)
    _vline(px, x0, y0, y1, outline, w, h)
    _vline(px, x1, y0, y1, outline, w, h)


# ─── FLOORS ───────────────────────────────────────────────────────────────────

def floor_gray_carpet() -> Image.Image:
    """floor_0: hallway carpet — beige with flecks."""
    img = _new(16, 16); px = img.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = CARPET_BEIGE
    # Subtle texture
    for (x, y) in [(2,1),(7,3),(13,2),(4,6),(10,5),(15,7),(1,9),(8,11),(12,13),(5,14),(3,4),(11,8)]:
        px[x, y] = CARPET_BEIGE_DK
    for (x, y) in [(0,0),(6,2),(11,4),(3,7),(14,10),(7,12),(9,15),(0,13),(13,14)]:
        px[x, y] = CARPET_BEIGE_LT
    # Loop-pile vertical line accents
    for x in (3, 11):
        for y in range(0, 16, 4):
            if px[x, y] == CARPET_BEIGE:
                px[x, y] = CARPET_BEIGE_DK
    return img


def floor_blue_carpet() -> Image.Image:
    """floor_1: focus room — gray-blue worn carpet tile, 2x2 grid pattern."""
    img = _new(16, 16); px = img.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = CARPET_BASE
    # 2x2 tile seams (slightly darker every 8px)
    for x in range(16):
        px[x, 7] = CARPET_DARK
        px[x, 15] = CARPET_DARK
    for y in range(16):
        px[7, y] = CARPET_DARK
        px[15, y] = CARPET_DARK
    # Flecks
    for (x, y) in [(1,1),(4,2),(11,3),(5,5),(10,6),(2,9),(6,10),(13,11),(9,13),(12,14)]:
        px[x, y] = CARPET_FLECK
    for (x, y) in [(3,3),(13,1),(0,5),(8,4),(14,8),(4,12),(11,14)]:
        px[x, y] = CARPET_LITE
    return img


def floor_linoleum() -> Image.Image:
    """floor_2: meeting room linoleum — beige with light marble streaks."""
    img = _new(16, 16); px = img.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = LINO_BASE
    # Marbled streaks (diagonal)
    for i in range(16):
        if (i % 4) == 0:
            for j in range(16):
                if (i + j) % 7 == 0:
                    if 0 <= i < 16 and 0 <= j < 16:
                        px[i, j] = LINO_LITE
    for (x, y) in [(2,3),(7,5),(11,2),(4,9),(13,11),(1,13),(9,14)]:
        px[x, y] = LINO_DARK
    # Tile seam every 8 px
    for x in range(16):
        px[x, 0] = LINO_DARK
    for y in range(16):
        px[0, y] = LINO_DARK
    return img


def floor_raised_metal() -> Image.Image:
    """floor_3: ops center raised perforated floor panel — 4 vents."""
    img = _new(16, 16); px = img.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = RAISED_BASE
    # Panel edges (gives 16px = single panel)
    for x in range(16):
        px[x, 0] = RAISED_DARK
        px[x, 15] = RAISED_DARK
    for y in range(16):
        px[0, y] = RAISED_DARK
        px[15, y] = RAISED_DARK
    # Highlight along top-left edges
    for x in range(1, 15):
        px[x, 1] = METAL_LITE
    for y in range(1, 15):
        px[1, y] = METAL_LITE
    # 4 perforations in a 2x2 grid
    for cy in (5, 11):
        for cx in (5, 11):
            px[cx, cy] = RAISED_HOLE
            px[cx + 1, cy] = RAISED_HOLE
            px[cx, cy + 1] = RAISED_HOLE
            px[cx + 1, cy + 1] = RAISED_HOLE
    return img


def floor_tatami() -> Image.Image:
    """floor_4: lounge — tatami-style mat with binding edges."""
    img = _new(16, 16); px = img.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = TATAMI_BASE
    # Weave: horizontal alternating dark stripes every 2 rows
    for y in (1, 4, 7, 10, 13):
        for x in range(1, 15):
            px[x, y] = TATAMI_DARK
    # Light grain stripes
    for y in (3, 6, 9, 12):
        for x in range(2, 15, 3):
            px[x, y] = TATAMI_LITE
    # Binding border on top/bottom (looks like cloth edge)
    for x in range(16):
        px[x, 0] = TATAMI_BIND
        px[x, 15] = TATAMI_BIND
    return img


def floor_bathroom_tile() -> Image.Image:
    """floor_5: bathroom — small white grid tile."""
    img = _new(16, 16); px = img.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = BTILE_BASE
    # 4x4 small tile grid
    for x in range(16):
        if x % 4 == 0:
            for y in range(16):
                px[x, y] = BTILE_GROUT
    for y in range(16):
        if y % 4 == 0:
            for x in range(16):
                px[x, y] = BTILE_GROUT
    # Subtle sheen highlights inside tiles
    for y in (1, 5, 9, 13):
        for x in (1, 5, 9, 13):
            px[x, y] = BTILE_SHEEN
    return img


def floor_genkan_stone() -> Image.Image:
    """floor_6: genkan — slate stone tile."""
    img = _new(16, 16); px = img.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = GENKAN_BASE
    # Slate veining
    for (x, y) in [(2,2),(3,2),(4,3),(7,5),(8,5),(9,6),(11,3),(12,4),(5,10),(6,10),(11,12),(12,12),(13,13)]:
        px[x, y] = GENKAN_DARK
    for (x, y) in [(0,0),(1,1),(5,3),(10,1),(2,7),(8,8),(14,9),(4,13),(13,7)]:
        px[x, y] = GENKAN_LITE
    return img


def floor_concrete() -> Image.Image:
    """floor_7: smoking corner — gray concrete."""
    img = _new(16, 16); px = img.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = CONCRETE_BASE
    for (x, y) in [(1,3),(4,5),(9,2),(12,7),(2,11),(7,13),(14,12),(11,14),(5,9),(8,6)]:
        px[x, y] = CONCRETE_DARK
    for (x, y) in [(3,1),(10,4),(13,2),(6,8),(0,10),(15,6),(7,15),(11,11)]:
        px[x, y] = CONCRETE_LITE
    # Crack
    for (x, y) in [(0,4),(1,4),(2,5),(3,5),(4,6),(5,6)]:
        px[x, y] = CONCRETE_DARK
    return img


def floor_wood_aisle() -> Image.Image:
    """floor_8: hallway transition (wooden plank)."""
    img = _new(16, 16); px = img.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = TATAMI_BASE
    # Plank seams every 8 rows
    for x in range(16):
        px[x, 7] = TATAMI_DARK
        px[x, 8] = TATAMI_BIND
        px[x, 15] = TATAMI_DARK
    # Wood grain
    for y in (2, 11):
        for x in range(1, 15, 3):
            px[x, y] = TATAMI_LITE
    for y in (4, 13):
        for x in range(2, 15, 3):
            px[x, y] = TATAMI_DARK
    return img


# ─── WALL ─────────────────────────────────────────────────────────────────────

def wall_panel() -> Image.Image:
    """wall_0: cream painted office panel with baseboard hint at bottom."""
    img = _new(16, 16); px = img.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = WALL_BASE
    # Top sheen
    for x in range(16):
        px[x, 0] = WALL_HI
    for y in range(1, 3):
        for x in range(0, 16, 2):
            px[x, y] = WALL_HI
    # Bottom shadow
    for x in range(16):
        px[x, 15] = WALL_TRIM
        px[x, 14] = WALL_SHADOW
    # Vertical seam (every 16px)
    for y in range(14):
        px[0, y] = WALL_SHADOW
    return img


# ─── CHARACTERS ───────────────────────────────────────────────────────────────
# 7 frames wide × 3 rows tall (down/up/right), each frame = 16×32.
# Frame layout per direction: [idle, walk1, walk2, type1, type2, read1, read2]

CHAR_W = 16
CHAR_H = 32


def _draw_salaryman(
    px,
    fx: int,
    fy: int,
    facing: str,  # 'down','up','right'
    pose: str,    # 'idle','walk1','walk2','type1','type2','read1','read2'
    suit: tuple,
    suit_dk: tuple,
    suit_lt: tuple,
    hair: tuple,
    hair_dk: tuple,
    skin: tuple,
    skin_dk: tuple,
    tie: tuple,
    has_glasses: bool,
    sheet_w: int,
    sheet_h: int,
) -> None:
    """Render a 16x32 salaryman frame into sheet at (fx,fy).
    Sprite anatomy (rough):
      y 0..1: top of head (mostly hair)
      y 2..7: head (with hair/face/glasses)
      y 8..9: neck/shirt collar
      y 10..21: torso (suit) + tie
      y 22..28: legs (slacks)
      y 29..31: shoes
    """
    def P(x, y, c):
        if 0 <= x < CHAR_W and 0 <= y < CHAR_H:
            _put(px, fx + x, fy + y, c, sheet_w, sheet_h)

    # ───── HEAD (rows 1..7) ─────
    # Hair top
    head_left, head_right = 5, 10
    for y in (1, 2):
        for x in range(head_left, head_right + 1):
            P(x, y, hair)
    P(head_left, 1, hair_dk); P(head_right, 1, hair_dk)
    # Face (rows 3..7)
    for y in range(3, 8):
        for x in range(head_left, head_right + 1):
            P(x, y, skin)
    # Hair side wraps
    if facing != 'up':
        for y in range(3, 5):
            P(head_left, y, hair)
            P(head_right, y, hair)
        P(head_left, 3, hair_dk)
        P(head_right, 3, hair_dk)
    else:
        # Back of head: cover face area entirely with hair
        for y in range(3, 8):
            for x in range(head_left, head_right + 1):
                P(x, y, hair)
        P(head_left, 3, hair_dk); P(head_right, 3, hair_dk)
        P(head_left, 7, hair_dk); P(head_right, 7, hair_dk)
    # Chin shadow
    for x in range(head_left + 1, head_right):
        P(x, 7, skin_dk)
    # Face features (only DOWN and RIGHT, never UP/back)
    if facing == 'down':
        # Eyes
        eye_y = 5
        if has_glasses:
            # Glasses frame
            P(6, eye_y, OUTLINE)
            P(6, eye_y - 1, OUTLINE)
            P(9, eye_y, OUTLINE)
            P(9, eye_y - 1, OUTLINE)
            P(7, eye_y, hair_dk)
            P(8, eye_y, hair_dk)
            P(7, eye_y - 1, OUTLINE)
            P(8, eye_y - 1, OUTLINE)
        else:
            P(6, eye_y, OUTLINE)
            P(9, eye_y, OUTLINE)
        # Mouth
        P(7, 7, hair_dk)
        P(8, 7, hair_dk)
    elif facing == 'right':
        # Profile: one eye
        if has_glasses:
            P(9, 5, OUTLINE)
            P(9, 4, OUTLINE)
            P(8, 5, hair_dk)
        else:
            P(9, 5, OUTLINE)
        # Mouth (right edge)
        P(8, 7, hair_dk)
        # Hair sweep at back of head
        for y in range(2, 6):
            P(5, y, hair_dk)
    # Ear hint
    if facing == 'right':
        P(5, 5, skin_dk)
    elif facing == 'down':
        P(5, 5, skin_dk)
        P(10, 5, skin_dk)

    # ───── NECK / COLLAR (rows 8..9) ─────
    P(7, 8, skin); P(8, 8, skin)
    # Suit collar
    for x in (5, 6, 9, 10):
        P(x, 8, suit_dk)
    for x in range(5, 11):
        P(x, 9, suit)
    P(7, 9, SHIRT_WT); P(8, 9, SHIRT_WT)

    # ───── TORSO (rows 10..21) ─────
    torso_l, torso_r = 4, 11
    for y in range(10, 22):
        for x in range(torso_l, torso_r + 1):
            P(x, y, suit)
    # Suit lapels (front-facing only)
    if facing in ('down', 'right'):
        for y in range(10, 16):
            P(6, y, suit_dk)
            P(9, y, suit_dk)
        # Lapel highlight
        for y in (10, 11, 12):
            P(5, y, suit_lt)
            P(10, y, suit_lt)
        # Shirt v-neck
        for y in range(10, 14):
            P(7, y, SHIRT_WT)
            P(8, y, SHIRT_WT)
        # Tie
        for y in range(13, 20):
            P(7, y, tie)
            P(8, y, tie)
        # Tie knot dark
        P(7, 13, hair_dk); P(8, 13, hair_dk)
    # Suit shoulder line
    P(torso_l, 10, suit_dk)
    P(torso_r, 10, suit_dk)
    # Side outline
    for y in range(10, 22):
        P(torso_l - 0, y, suit_dk) if y in (10, 21) else None
        P(torso_r - 0, y, suit_dk) if y in (10, 21) else None
    # Bottom of jacket (row 21) darker
    for x in range(torso_l, torso_r + 1):
        P(x, 21, suit_dk)

    # Arms by pose
    arm_l, arm_r = torso_l - 1, torso_r + 1
    # default arms at sides (idle)
    arm_top, arm_bot = 11, 19
    for y in range(arm_top, arm_bot + 1):
        P(arm_l, y, suit)
        P(arm_r, y, suit)
    # Arm outline
    for y in (arm_top, arm_bot):
        P(arm_l, y, suit_dk); P(arm_r, y, suit_dk)
    # Hands (skin)
    P(arm_l, arm_bot + 1, skin); P(arm_r, arm_bot + 1, skin)
    P(arm_l, arm_bot + 1, skin_dk)  # darker side
    if pose == 'type1' or pose == 'type2':
        # Arms forward → hands at chest level on keyboard
        P(arm_l, arm_bot + 1, TRANSPARENT)
        P(arm_r, arm_bot + 1, TRANSPARENT)
        bend = 0 if pose == 'type1' else 1
        # Forearms forward and inward
        for y in range(15, 17 + bend):
            P(5, y, suit)
            P(10, y, suit)
        P(6, 17 + bend, skin)
        P(9, 17 + bend, skin)
    elif pose == 'read1' or pose == 'read2':
        # Hands raised holding a paper/document
        P(arm_l, arm_bot + 1, TRANSPARENT)
        P(arm_r, arm_bot + 1, TRANSPARENT)
        # Forearms inward & up
        for y in range(13, 17):
            P(5, y, suit)
            P(10, y, suit)
        # Document (light paper)
        for y in range(13, 16):
            for x in range(6, 10):
                P(x, y, SHIRT_WT)
        # Doc lines
        P(7, 14, hair_dk); P(8, 14, hair_dk)
        # Slight wobble
        if pose == 'read2':
            P(6, 13, hair_dk); P(9, 13, hair_dk)

    # ───── LEGS (rows 22..28) ─────
    leg_l, leg_r = 5, 10
    for y in range(22, 29):
        for x in range(leg_l, leg_r + 1):
            P(x, y, suit_dk)
    # Center crease
    for y in range(22, 29):
        P(7, y, OUTLINE)
        P(8, y, suit)

    # ───── SHOES (rows 29..31) ─────
    for x in (5, 6):
        P(x, 30, OUTLINE)
        P(x, 31, OUTLINE)
    for x in (9, 10):
        P(x, 30, OUTLINE)
        P(x, 31, OUTLINE)
    # Walk pose: foot lifted
    if pose == 'walk1':
        for x in (5, 6):
            P(x, 31, TRANSPARENT)
        for x in (5, 6):
            P(x, 29, OUTLINE)
    elif pose == 'walk2':
        for x in (9, 10):
            P(x, 31, TRANSPARENT)
        for x in (9, 10):
            P(x, 29, OUTLINE)


def _draw_ol(
    px,
    fx: int,
    fy: int,
    facing: str,
    pose: str,
    blaz: tuple,
    blaz_dk: tuple,
    blaz_lt: tuple,
    hair: tuple,
    hair_dk: tuple,
    skin: tuple,
    skin_dk: tuple,
    scarf: tuple,
    sheet_w: int,
    sheet_h: int,
) -> None:
    """Render a 16x32 female office worker (navy blazer + skirt) frame."""
    def P(x, y, c):
        if 0 <= x < CHAR_W and 0 <= y < CHAR_H:
            _put(px, fx + x, fy + y, c, sheet_w, sheet_h)

    # Head with longer hair frame
    head_left, head_right = 5, 10
    # Hair top
    for y in (1, 2):
        for x in range(head_left, head_right + 1):
            P(x, y, hair)
    P(head_left, 1, hair_dk); P(head_right, 1, hair_dk)
    # Face
    for y in range(3, 8):
        for x in range(head_left, head_right + 1):
            P(x, y, skin)
    # Long hair side (frames the face)
    if facing != 'up':
        for y in range(3, 9):
            P(head_left, y, hair)
            P(head_right, y, hair)
        # Extra strand
        P(head_left - 0, 9, hair_dk) if False else None
    else:
        for y in range(3, 8):
            for x in range(head_left, head_right + 1):
                P(x, y, hair)
        # Ponytail hint at back center
        P(7, 8, hair); P(8, 8, hair)
    # Bangs
    P(6, 3, hair_dk); P(9, 3, hair_dk)
    P(7, 3, hair); P(8, 3, hair)
    # Chin
    for x in range(head_left + 1, head_right):
        P(x, 7, skin_dk)
    # Face features
    if facing == 'down':
        P(6, 5, OUTLINE)
        P(9, 5, OUTLINE)
        # Lip
        P(7, 7, TIE_RED); P(8, 7, TIE_RED)
    elif facing == 'right':
        P(9, 5, OUTLINE)
        P(8, 7, TIE_RED)
        for y in range(2, 6):
            P(5, y, hair)
            P(5, y if y > 3 else y, hair_dk if y == 3 else hair)

    # Neck + scarf collar
    P(7, 8, skin); P(8, 8, skin)
    if facing != 'up':
        # Scarf
        for x in range(5, 11):
            P(x, 9, scarf)
        P(6, 9, blaz_dk); P(9, 9, blaz_dk)

    # Blazer
    torso_l, torso_r = 4, 11
    for y in range(10, 22):
        for x in range(torso_l, torso_r + 1):
            P(x, y, blaz)
    # Lapels / button line
    if facing in ('down', 'right'):
        for y in range(11, 18):
            P(7, y, blaz_dk)
            P(8, y, blaz_dk)
        # Inner blouse hint
        P(7, 10, SHIRT_WT); P(8, 10, SHIRT_WT)
        # Buttons
        P(7, 13, blaz_lt); P(8, 16, blaz_lt)
    # Shoulder seams
    for x in range(torso_l, torso_r + 1):
        P(x, 10, blaz_dk)
        P(x, 21, blaz_dk)

    # Arms
    arm_l, arm_r = torso_l - 1, torso_r + 1
    for y in range(11, 20):
        P(arm_l, y, blaz)
        P(arm_r, y, blaz)
    for y in (11, 19):
        P(arm_l, y, blaz_dk); P(arm_r, y, blaz_dk)
    # Hands
    P(arm_l, 20, skin); P(arm_r, 20, skin)
    if pose == 'type1' or pose == 'type2':
        P(arm_l, 20, TRANSPARENT); P(arm_r, 20, TRANSPARENT)
        bend = 0 if pose == 'type1' else 1
        for y in range(15, 17 + bend):
            P(5, y, blaz); P(10, y, blaz)
        P(6, 17 + bend, skin); P(9, 17 + bend, skin)
    elif pose == 'read1' or pose == 'read2':
        P(arm_l, 20, TRANSPARENT); P(arm_r, 20, TRANSPARENT)
        for y in range(13, 17):
            P(5, y, blaz); P(10, y, blaz)
        for y in range(13, 16):
            for x in range(6, 10):
                P(x, y, SHIRT_WT)
        P(7, 14, hair_dk); P(8, 14, hair_dk)

    # Skirt (knee length) — rows 22..26
    for y in range(22, 27):
        for x in range(4, 12):
            P(x, y, blaz_dk)
    # Skirt flare
    P(3, 26, blaz_dk); P(12, 26, blaz_dk)
    # Pleat lines
    for y in range(22, 26):
        P(6, y, OUTLINE)
        P(9, y, OUTLINE)

    # Legs (stockings — skin tone)
    for y in range(27, 30):
        for x in (6, 7):
            P(x, y, skin_dk)
        for x in (8, 9):
            P(x, y, skin_dk)

    # Shoes (low heels)
    for x in (5, 6, 7):
        P(x, 30, OUTLINE); P(x, 31, OUTLINE)
    for x in (8, 9, 10):
        P(x, 30, OUTLINE); P(x, 31, OUTLINE)
    if pose == 'walk1':
        for x in (5, 6):
            P(x, 31, TRANSPARENT); P(x, 29, OUTLINE)
    elif pose == 'walk2':
        for x in (9, 10):
            P(x, 31, TRANSPARENT); P(x, 29, OUTLINE)


def make_character(
    style: str,
    suit: tuple, suit_dk: tuple, suit_lt: tuple,
    hair: tuple, hair_dk: tuple,
    skin: tuple, skin_dk: tuple,
    tie: tuple,
    has_glasses: bool = False,
) -> Image.Image:
    """Build a 7x3-frame character sheet (112x96)."""
    sheet_w, sheet_h = 7 * CHAR_W, 3 * CHAR_H
    img = _new(sheet_w, sheet_h)
    px = img.load()
    poses = ['idle', 'walk1', 'walk2', 'type1', 'type2', 'read1', 'read2']
    # Row 0: DOWN, Row 1: UP, Row 2: RIGHT (matches sprites.ts)
    for row, facing in enumerate(['down', 'up', 'right']):
        for col, pose in enumerate(poses):
            fx = col * CHAR_W
            fy = row * CHAR_H
            if style == 'salaryman':
                _draw_salaryman(
                    px, fx, fy, facing, pose,
                    suit, suit_dk, suit_lt,
                    hair, hair_dk,
                    skin, skin_dk,
                    tie, has_glasses,
                    sheet_w, sheet_h,
                )
            else:
                _draw_ol(
                    px, fx, fy, facing, pose,
                    suit, suit_dk, suit_lt,
                    hair, hair_dk,
                    skin, skin_dk,
                    tie,
                    sheet_w, sheet_h,
                )
    return img


# ─── FURNITURE ────────────────────────────────────────────────────────────────

def furniture_desk_front() -> Image.Image:
    """48x32 — 1990s Japanese metal-frame office desk, front view.
    Top row (16px) is the laminate desk surface; bottom row (16px) is the metal
    frame + drawers + chair clearance gap.
    """
    img = _new(48, 32); px = img.load()
    # Desk top (laminate)
    for y in range(0, 14):
        for x in range(0, 48):
            px[x, y] = WOOD_BASE
    # Top sheen
    for x in range(48):
        px[x, 0] = WOOD_LITE
    for x in range(0, 48, 3):
        px[x, 1] = WOOD_LITE
    # Edge band
    for x in range(48):
        px[x, 13] = WOOD_DARK
        px[x, 14] = OUTLINE
    # Metal frame underneath
    for y in range(15, 32):
        for x in range(0, 48):
            px[x, y] = METAL_BASE
    # Metal highlights
    for x in range(48):
        px[x, 15] = METAL_LITE
    # Side panels
    for y in range(15, 31):
        px[0, y] = METAL_DARK
        px[1, y] = METAL_DARK
        px[46, y] = METAL_DARK
        px[47, y] = METAL_DARK
    # Drawer unit on right (3 stacked drawers)
    for y in range(15, 31):
        for x in range(36, 46):
            px[x, y] = METAL_BASE
    for x in range(36, 47):
        px[x, 14] = OUTLINE
        px[x, 30] = OUTLINE
    for y in (19, 23, 27):
        for x in range(36, 47):
            px[x, y] = METAL_DARK
    # Drawer pulls
    for y in (17, 21, 25, 29):
        px[40, y] = METAL_BLACK
        px[41, y] = METAL_BLACK
        px[42, y] = METAL_BLACK
    # Modesty panel (front)
    for y in range(16, 28):
        for x in range(4, 36):
            if y in (16, 27):
                px[x, y] = METAL_DARK
            else:
                px[x, y] = METAL_BASE
    # Cable hole (right side)
    px[44, 8] = OUTLINE
    px[45, 8] = OUTLINE
    px[44, 9] = OUTLINE
    px[45, 9] = OUTLINE
    # Bottom shadow
    for x in range(48):
        px[x, 31] = OUTLINE
    return img


def furniture_desk_side() -> Image.Image:
    """16x64 — desk viewed from side (1×4 tile footprint)."""
    img = _new(16, 64); px = img.load()
    # Desk surface (top 14px)
    for y in range(0, 14):
        for x in range(16):
            px[x, y] = WOOD_BASE
    for x in range(16):
        px[x, 0] = WOOD_LITE
        px[x, 13] = WOOD_DARK
        px[x, 14] = OUTLINE
    # Left leg
    for y in range(15, 62):
        for x in range(0, 5):
            px[x, y] = METAL_BASE
    # Drawer unit on right (full height)
    for y in range(15, 62):
        for x in range(5, 14):
            px[x, y] = METAL_BASE
    for x in range(15, 16):
        for y in range(15, 62):
            px[x, y] = METAL_DARK
    # Drawer dividers
    for y in (24, 36, 48):
        for x in range(5, 16):
            px[x, y] = METAL_DARK
    # Drawer pulls
    for y in (20, 32, 44, 56):
        px[8, y] = METAL_BLACK; px[9, y] = METAL_BLACK; px[10, y] = METAL_BLACK
    # Edges
    for x in range(16):
        px[x, 62] = OUTLINE
        px[x, 63] = OUTLINE
    return img


def furniture_pc_front() -> Image.Image:
    """16x32 — CRT monitor (front, off) on keyboard. Top half: monitor; bottom: keyboard tray (visually merges with desk)."""
    img = _new(16, 32); px = img.load()
    # CRT monitor bezel (occupies top ~16px, overhanging desk upward)
    # Outer case
    for y in range(2, 16):
        for x in range(1, 15):
            px[x, y] = CRT_BEZEL
    # Outline
    for x in range(1, 15):
        px[x, 2] = OUTLINE
        px[x, 15] = OUTLINE
    for y in range(2, 16):
        px[1, y] = OUTLINE
        px[14, y] = OUTLINE
    # Screen (recessed)
    for y in range(5, 13):
        for x in range(3, 13):
            px[x, y] = CRT_SCREEN
    for x in range(3, 13):
        px[x, 4] = CRT_BEZEL_DK
        px[x, 13] = CRT_BEZEL_DK
    # Subtle screen reflection
    for x in range(4, 7):
        px[x, 5] = CRT_BEZEL_DK
    # Power LED
    px[12, 14] = (212, 80, 60, 255)
    # Brand bar bottom
    for x in range(3, 13):
        px[x, 14] = CRT_BEZEL_DK
    # Vent slots top
    for x in (3, 5, 7, 9, 11):
        px[x, 3] = CRT_BEZEL_DK
    # Keyboard stack (rows 16..21) — sits on desk
    for y in range(18, 22):
        for x in range(1, 15):
            px[x, y] = METAL_BASE
    for x in range(1, 15):
        px[x, 18] = METAL_LITE
        px[x, 21] = OUTLINE
    # Keys (small rects)
    for y in (19, 20):
        for x in range(2, 14, 2):
            px[x, y] = METAL_DARK
    # Mouse to right
    px[13, 23] = METAL_BASE; px[14, 23] = METAL_BASE
    px[13, 24] = METAL_DARK; px[14, 24] = METAL_DARK
    return img


def furniture_pc_back() -> Image.Image:
    """16x32 — CRT monitor from the back (cable bundle visible)."""
    img = _new(16, 32); px = img.load()
    # Monitor back
    for y in range(2, 16):
        for x in range(1, 15):
            px[x, y] = CRT_BEZEL_DK
    # Outline
    for x in range(1, 15):
        px[x, 2] = OUTLINE
        px[x, 15] = OUTLINE
    for y in range(2, 16):
        px[1, y] = OUTLINE
        px[14, y] = OUTLINE
    # Vent grille
    for y in range(5, 13, 2):
        for x in range(3, 13):
            px[x, y] = OUTLINE
    # Cable bundle hanging
    for y in range(16, 22):
        px[7, y] = OUTLINE
        px[8, y] = METAL_BLACK
    # Keyboard back
    for y in range(18, 22):
        for x in range(1, 15):
            px[x, y] = METAL_DARK
    for x in range(1, 15):
        px[x, 18] = METAL_LITE
        px[x, 21] = OUTLINE
    return img


def furniture_pc_side() -> Image.Image:
    """16x32 — CRT monitor from side; deep box with vent ridges."""
    img = _new(16, 32); px = img.load()
    # Side box (deeper than wide)
    for y in range(2, 16):
        for x in range(2, 14):
            px[x, y] = CRT_BEZEL
    for x in range(2, 14):
        px[x, 2] = OUTLINE
        px[x, 15] = OUTLINE
    for y in range(2, 16):
        px[2, y] = OUTLINE
        px[13, y] = OUTLINE
    # Screen edge on right
    for y in range(4, 14):
        px[12, y] = CRT_SCREEN
        px[11, y] = CRT_BEZEL_DK
    # Vent ridges
    for x in (4, 6, 8, 10):
        for y in range(4, 14, 2):
            px[x, y] = CRT_BEZEL_DK
    # Keyboard
    for y in range(18, 22):
        for x in range(1, 15):
            px[x, y] = METAL_BASE
    for x in range(1, 15):
        px[x, 18] = METAL_LITE
        px[x, 21] = OUTLINE
    return img


def furniture_chair_front() -> Image.Image:
    """16x32 — office swivel chair, front view (we see the seat back)."""
    img = _new(16, 32); px = img.load()
    # Backrest (top half)
    for y in range(2, 16):
        for x in range(3, 13):
            px[x, y] = SUIT_BASE
    for x in range(3, 13):
        px[x, 2] = OUTLINE
        px[x, 15] = OUTLINE
    for y in range(2, 16):
        px[3, y] = OUTLINE
        px[12, y] = OUTLINE
    # Backrest cushion stitch
    for y in (5, 9, 13):
        for x in range(4, 12):
            px[x, y] = SUIT_DK
    # Highlight
    for y in (3, 4):
        for x in range(4, 12):
            px[x, y] = SUIT_LT
    # Seat (cushion)
    for y in range(17, 22):
        for x in range(2, 14):
            px[x, y] = SUIT_BASE
    for x in range(2, 14):
        px[x, 17] = OUTLINE
        px[x, 21] = OUTLINE
    for y in range(17, 22):
        px[2, y] = OUTLINE
        px[13, y] = OUTLINE
    # Central post
    for y in range(22, 28):
        px[7, y] = METAL_DARK; px[8, y] = METAL_DARK
    # 5-star base
    px[3, 28] = METAL_BASE; px[4, 28] = METAL_BASE; px[5, 28] = METAL_BASE
    px[6, 28] = METAL_BASE; px[7, 28] = METAL_BASE; px[8, 28] = METAL_BASE
    px[9, 28] = METAL_BASE; px[10, 28] = METAL_BASE; px[11, 28] = METAL_BASE
    px[12, 28] = METAL_BASE
    for x in range(2, 14):
        px[x, 29] = METAL_DARK
    # Casters
    px[2, 30] = OUTLINE; px[3, 30] = OUTLINE
    px[7, 30] = OUTLINE; px[8, 30] = OUTLINE
    px[12, 30] = OUTLINE; px[13, 30] = OUTLINE
    px[2, 31] = OUTLINE; px[3, 31] = OUTLINE
    px[7, 31] = OUTLINE; px[8, 31] = OUTLINE
    px[12, 31] = OUTLINE; px[13, 31] = OUTLINE
    return img


def furniture_chair_back() -> Image.Image:
    """16x32 — office swivel chair, back view (we see the front of the seat back from behind)."""
    img = _new(16, 32); px = img.load()
    # Backrest (rows 0..14, slightly taller since we see behind)
    for y in range(0, 14):
        for x in range(3, 13):
            px[x, y] = SUIT_DK
    for x in range(3, 13):
        px[x, 0] = OUTLINE
        px[x, 13] = OUTLINE
    for y in range(0, 14):
        px[3, y] = OUTLINE
        px[12, y] = OUTLINE
    # Vertical stitch (middle of back)
    for y in range(2, 12):
        px[7, y] = SUIT_BASE
        px[8, y] = SUIT_BASE
    # Adjustment knob
    px[7, 14] = METAL_DARK; px[8, 14] = METAL_DARK
    # Seat back-edge (shows behind backrest)
    for y in range(15, 20):
        for x in range(2, 14):
            px[x, y] = SUIT_BASE
    for x in range(2, 14):
        px[x, 15] = OUTLINE
        px[x, 19] = OUTLINE
    for y in range(15, 20):
        px[2, y] = OUTLINE
        px[13, y] = OUTLINE
    # Post + base same as front
    for y in range(20, 28):
        px[7, y] = METAL_DARK; px[8, y] = METAL_DARK
    for x in range(2, 14):
        px[x, 28] = METAL_BASE
    for x in range(2, 14):
        px[x, 29] = METAL_DARK
    # Casters
    for x in (2, 7, 12):
        for dy in (30, 31):
            px[x, dy] = OUTLINE
            px[x + 1, dy] = OUTLINE
    return img


def furniture_chair_side() -> Image.Image:
    """16x32 — office swivel chair, side view."""
    img = _new(16, 32); px = img.load()
    # Backrest profile
    for y in range(2, 16):
        for x in range(7, 12):
            px[x, y] = SUIT_BASE
    for x in range(7, 12):
        px[x, 2] = OUTLINE
        px[x, 15] = OUTLINE
    for y in range(2, 16):
        px[7, y] = OUTLINE
        px[11, y] = OUTLINE
    # Armrest hint
    for x in range(4, 11):
        px[x, 16] = METAL_DARK
        px[x, 17] = METAL_DARK
    # Seat side
    for y in range(18, 22):
        for x in range(3, 13):
            px[x, y] = SUIT_BASE
    for x in range(3, 13):
        px[x, 18] = OUTLINE
        px[x, 21] = OUTLINE
    for y in range(18, 22):
        px[3, y] = OUTLINE
        px[12, y] = OUTLINE
    # Post + base
    for y in range(22, 28):
        px[7, y] = METAL_DARK; px[8, y] = METAL_DARK
    for x in range(2, 14):
        px[x, 28] = METAL_BASE
        px[x, 29] = METAL_DARK
    for x in (3, 8, 12):
        for dy in (30, 31):
            px[x, dy] = OUTLINE
    return img


def furniture_table_front() -> Image.Image:
    """48x64 — meeting room conference table (3w × 4h)."""
    img = _new(48, 64); px = img.load()
    # Table top (top half = rows 0..31)
    for y in range(2, 30):
        for x in range(0, 48):
            px[x, y] = WOOD_BASE
    # Top sheen + edge
    for x in range(48):
        px[x, 2] = WOOD_LITE
        px[x, 29] = WOOD_DARK
        px[x, 30] = OUTLINE
    # Subtle grain
    for x in range(0, 48, 4):
        for y in range(4, 28, 6):
            px[x, y] = WOOD_LITE
    # Side edges
    for y in range(2, 31):
        px[0, y] = WOOD_DARK
        px[47, y] = WOOD_DARK
    # Legs (4 corners) — chrome metal
    for x_pair in ((4, 7), (40, 43)):
        for y in range(31, 60):
            for x in range(x_pair[0], x_pair[1] + 1):
                px[x, y] = METAL_BASE
        for x in range(x_pair[0], x_pair[1] + 1):
            px[x, 60] = METAL_DARK
            px[x, 61] = OUTLINE
        for y in range(31, 60):
            px[x_pair[0], y] = METAL_DARK
            px[x_pair[1], y] = METAL_LITE
    # Center crossbeam
    for x in range(10, 38):
        px[x, 50] = METAL_DARK
        px[x, 51] = METAL_BASE
    # Floor shadow
    for x in range(2, 46):
        px[x, 62] = (0, 0, 0, 96)
        px[x, 63] = (0, 0, 0, 64)
    return img


def furniture_whiteboard() -> Image.Image:
    """32x32 — wall-mounted whiteboard with frame and content."""
    img = _new(32, 32); px = img.load()
    # Frame
    for y in range(2, 28):
        for x in range(1, 31):
            px[x, y] = METAL_LITE
    for x in range(1, 31):
        px[x, 2] = METAL_DARK
        px[x, 27] = METAL_DARK
    for y in range(2, 28):
        px[1, y] = METAL_DARK
        px[30, y] = METAL_DARK
    # White surface
    for y in range(4, 26):
        for x in range(3, 29):
            px[x, y] = SHIRT_WT
    # Marker scribbles
    for x in range(5, 12):
        px[x, 8] = TIE_RED
    for x in range(14, 22):
        px[x, 8] = PAINT_JADE
    for x in range(5, 18):
        px[x, 12] = OUTLINE
    for x in range(6, 14):
        px[x, 16] = TIE_NV
    for x in range(16, 24):
        px[x, 16] = TIE_RED
    # Marker tray + markers
    for x in range(3, 29):
        px[x, 26] = METAL_DARK
    for (x, c) in ((6, TIE_RED), (10, OUTLINE), (14, TIE_NV), (18, PAINT_JADE)):
        px[x, 26] = c
        px[x + 1, 26] = c
    return img


def furniture_bookshelf() -> Image.Image:
    """32x16 — short filing cabinet (3 drawers wide × 1 tall)."""
    img = _new(32, 16); px = img.load()
    # Cabinet body
    for y in range(0, 15):
        for x in range(0, 32):
            px[x, y] = METAL_BASE
    # Outline
    for x in range(32):
        px[x, 0] = OUTLINE
        px[x, 15] = OUTLINE
    for y in range(16):
        px[0, y] = OUTLINE
        px[31, y] = OUTLINE
    # Highlight
    for x in range(1, 31):
        px[x, 1] = METAL_LITE
    # 3 drawers
    for dx in (10, 21):
        for y in range(1, 15):
            px[dx, y] = METAL_DARK
    # Label holders + pulls
    for dx in (3, 14, 25):
        for x in range(dx, dx + 4):
            px[x, 4] = SHIRT_WT  # label
            px[x, 5] = SHIRT_WT
        px[dx + 4, 4] = OUTLINE; px[dx + 4, 5] = OUTLINE
        px[dx - 1, 4] = OUTLINE; px[dx - 1, 5] = OUTLINE
        # Pull handle
        for x in range(dx, dx + 5):
            px[x, 10] = METAL_BLACK
        px[dx, 11] = METAL_BLACK; px[dx + 4, 11] = METAL_BLACK
    return img


def furniture_double_bookshelf() -> Image.Image:
    """32x32 — taller filing cabinet (2 wide × 2 tall = 4 large drawers in 2x2 grid)."""
    img = _new(32, 32); px = img.load()
    for y in range(0, 31):
        for x in range(0, 32):
            px[x, y] = METAL_BASE
    for x in range(32):
        px[x, 0] = OUTLINE
        px[x, 31] = OUTLINE
    for y in range(32):
        px[0, y] = OUTLINE
        px[31, y] = OUTLINE
    for x in range(1, 31):
        px[x, 1] = METAL_LITE
    # Divider
    for x in range(32):
        px[x, 16] = METAL_DARK
    for y in range(32):
        px[16, y] = METAL_DARK
    # 4 drawers
    for (cx, cy) in ((4, 4), (20, 4), (4, 20), (20, 20)):
        # Label
        for x in range(cx, cx + 6):
            px[x, cy] = SHIRT_WT
            px[x, cy + 1] = SHIRT_WT
        px[cx - 1, cy] = OUTLINE; px[cx - 1, cy + 1] = OUTLINE
        px[cx + 6, cy] = OUTLINE; px[cx + 6, cy + 1] = OUTLINE
        # Handle
        for x in range(cx, cx + 8):
            px[x, cy + 6] = METAL_BLACK
        px[cx, cy + 7] = METAL_BLACK
        px[cx + 7, cy + 7] = METAL_BLACK
    # Top cap shadow
    for x in range(1, 31):
        px[x, 30] = METAL_DARK
    return img


def furniture_plant_small() -> Image.Image:
    """16x32 — small desk potted plant (1×2 tile, overhang)."""
    img = _new(16, 32); px = img.load()
    # Leaves (rows 8..24)
    leaves = [
        (8, 14), (9, 14), (7, 15), (10, 15), (6, 16), (11, 16),
        (8, 17), (9, 17), (10, 17),
        (5, 18), (6, 18), (10, 18), (11, 18),
        (4, 19), (12, 19), (6, 19), (9, 19),
        (5, 20), (11, 20), (8, 20),
        (6, 21), (10, 21),
        (7, 22), (9, 22),
    ]
    for (x, y) in leaves:
        px[x, y] = LEAF_BASE
    # Darker veins
    for (x, y) in [(8, 16), (9, 18), (6, 20)]:
        px[x, y] = LEAF_DK
    # Highlights
    for (x, y) in [(7, 16), (10, 19), (8, 21)]:
        px[x, y] = LEAF_LT
    # Pot (rows 24..30)
    for y in range(24, 30):
        for x in range(4, 13):
            px[x, y] = POT_BASE
    # Outline
    for x in range(4, 13):
        px[x, 24] = OUTLINE
        px[x, 29] = OUTLINE
    for y in range(24, 30):
        px[4, y] = OUTLINE
        px[12, y] = OUTLINE
    # Highlight
    for y in range(25, 29):
        px[5, y] = POT_LITE
    # Rim
    for x in range(3, 14):
        px[x, 23] = POT_DARK
        px[x, 24] = POT_BASE
    return img


def furniture_plant_large() -> Image.Image:
    """32x48 — large floor potted plant in ceramic pot (2×3 tile)."""
    img = _new(32, 48); px = img.load()
    # Leaves (broad fan)
    bushy = [
        (12, 10), (15, 8), (18, 9), (10, 12), (20, 11), (8, 14), (22, 13),
        (14, 6), (16, 5), (17, 6), (13, 7), (19, 7),
        (11, 9), (21, 10), (9, 11), (23, 12),
        (12, 14), (15, 14), (18, 14), (21, 14),
        (10, 16), (13, 16), (16, 16), (19, 16), (22, 16),
        (8, 18), (11, 18), (14, 18), (17, 18), (20, 18), (23, 18),
        (12, 20), (15, 20), (18, 20),
        (10, 22), (13, 22), (17, 22), (20, 22), (22, 22),
        (12, 24), (15, 24), (18, 24), (21, 24),
        (14, 26), (17, 26),
    ]
    for (x, y) in bushy:
        px[x, y] = LEAF_BASE
        if 0 <= x + 1 < 32:
            px[x + 1, y] = LEAF_BASE
    # Vein darks
    for (x, y) in [(14, 12), (18, 14), (12, 18), (20, 20), (16, 24)]:
        px[x, y] = LEAF_DK
    # Highlights
    for (x, y) in [(16, 8), (12, 16), (20, 16), (16, 20), (18, 24)]:
        px[x, y] = LEAF_LT
    # Pot (ceramic blue, rows 30..44)
    for y in range(30, 44):
        for x in range(7, 25):
            px[x, y] = POT_BLUE
    # Rim
    for x in range(6, 26):
        px[x, 28] = OUTLINE
        px[x, 29] = POT_BLUE_DK
    # Outline
    for x in range(7, 25):
        px[x, 30] = OUTLINE
        px[x, 43] = OUTLINE
    for y in range(30, 44):
        px[7, y] = OUTLINE
        px[24, y] = OUTLINE
    # Highlights
    for y in range(31, 43):
        px[8, y] = POT_BLUE_LT
    # Pattern band
    for x in range(9, 24, 3):
        px[x, 36] = SHIRT_WT
        px[x, 37] = SHIRT_WT
    # Floor shadow
    for x in range(6, 26):
        px[x, 45] = (0, 0, 0, 80)
        px[x, 46] = (0, 0, 0, 50)
    return img


def furniture_hanging_plant() -> Image.Image:
    """16x32 — hanging plant from ceiling."""
    img = _new(16, 32); px = img.load()
    # Hanger rope/wire
    for y in range(0, 12):
        px[7, y] = OUTLINE
        px[8, y] = METAL_BASE
    # Hook
    px[5, 0] = METAL_DARK; px[6, 0] = METAL_DARK
    px[9, 0] = METAL_DARK; px[10, 0] = METAL_DARK
    # Pot (rows 12..18, ceramic small)
    for y in range(12, 18):
        for x in range(3, 13):
            px[x, y] = POT_BASE
    for x in range(3, 13):
        px[x, 12] = OUTLINE
        px[x, 17] = OUTLINE
    for y in range(12, 18):
        px[3, y] = OUTLINE
        px[12, y] = OUTLINE
    for y in range(13, 17):
        px[4, y] = POT_LITE
    # Trailing leaves
    leaves = [
        (4, 18), (5, 19), (5, 20), (6, 21), (6, 22),
        (10, 18), (11, 19), (11, 20), (10, 21), (10, 22),
        (8, 19), (7, 21), (9, 23), (8, 24),
        (5, 25), (10, 25), (6, 27), (9, 27), (8, 29),
    ]
    for (x, y) in leaves:
        px[x, y] = LEAF_BASE
    for (x, y) in [(6, 23), (9, 25), (8, 27)]:
        px[x, y] = LEAF_DK
    for (x, y) in [(5, 22), (10, 23), (8, 26)]:
        px[x, y] = LEAF_LT
    return img


def furniture_cactus() -> Image.Image:
    """16x32 — small desk cactus."""
    img = _new(16, 32); px = img.load()
    # Cactus body (column)
    for y in range(10, 26):
        for x in range(6, 10):
            px[x, y] = LEAF_BASE
    for x in range(6, 10):
        px[x, 10] = LEAF_DK
        px[x, 25] = LEAF_DK
    for y in range(10, 26):
        px[6, y] = LEAF_DK
        px[9, y] = LEAF_DK
    # Ridges
    for y in range(11, 25, 2):
        px[7, y] = LEAF_LT
        px[8, y] = LEAF_LT
    # Side arm
    for y in range(14, 18):
        px[10, y] = LEAF_BASE
        px[11, y] = LEAF_BASE
    for x in (10, 11):
        px[x, 14] = LEAF_DK
        px[x, 17] = LEAF_DK
    px[12, 14] = LEAF_DK; px[12, 15] = LEAF_BASE; px[12, 16] = LEAF_DK
    # Spines (white pixels)
    for (x, y) in [(7, 12), (8, 14), (7, 16), (8, 18), (7, 20), (8, 22)]:
        px[x, y] = SHIRT_WT
    # Pot
    for y in range(26, 30):
        for x in range(4, 13):
            px[x, y] = POT_BASE
    for x in range(4, 13):
        px[x, 26] = OUTLINE
        px[x, 29] = OUTLINE
    for y in range(26, 30):
        px[4, y] = OUTLINE
        px[12, y] = OUTLINE
    for y in range(27, 29):
        px[5, y] = POT_LITE
    return img


def furniture_sofa_front() -> Image.Image:
    """32x16 — office sofa, front view (2w × 1h)."""
    img = _new(32, 16); px = img.load()
    # Backrest (rows 0..8)
    for y in range(0, 9):
        for x in range(2, 30):
            px[x, y] = SUIT_BASE
    # Top edge
    for x in range(2, 30):
        px[x, 0] = OUTLINE
        px[x, 8] = SUIT_DK
    for y in range(0, 9):
        px[2, y] = OUTLINE
        px[29, y] = OUTLINE
    # Cushion stitches (2 cushions)
    for y in range(1, 8):
        px[15, y] = SUIT_DK
        px[16, y] = SUIT_DK
    # Top highlight
    for x in range(3, 29):
        px[x, 1] = SUIT_LT
    # Seat (rows 9..14)
    for y in range(9, 15):
        for x in range(1, 31):
            px[x, y] = SUIT_BASE
    for x in range(1, 31):
        px[x, 9] = OUTLINE
        px[x, 14] = SUIT_DK
    for y in range(9, 15):
        px[1, y] = OUTLINE
        px[30, y] = OUTLINE
    # Armrests
    for y in range(0, 12):
        for x in (0, 1):
            px[x, y] = SUIT_DK
        for x in (30, 31):
            px[x, y] = SUIT_DK
    # Legs
    for x in (1, 30):
        px[x, 15] = OUTLINE
    return img


def furniture_sofa_back() -> Image.Image:
    """32x16 — office sofa from behind."""
    img = _new(32, 16); px = img.load()
    # Big back panel
    for y in range(2, 14):
        for x in range(0, 32):
            px[x, y] = SUIT_DK
    for x in range(32):
        px[x, 2] = OUTLINE
        px[x, 13] = OUTLINE
    for y in range(2, 14):
        px[0, y] = OUTLINE
        px[31, y] = OUTLINE
    # Cushion divider
    for y in range(2, 14):
        px[15, y] = OUTLINE
        px[16, y] = SUIT_BASE
    # Top piping
    for x in range(1, 31):
        px[x, 3] = SUIT_BASE
    return img


def furniture_sofa_side() -> Image.Image:
    """16x32 — office sofa from side."""
    img = _new(16, 32); px = img.load()
    # Backrest (left side, rows 4..16, narrower)
    for y in range(4, 18):
        for x in range(2, 8):
            px[x, y] = SUIT_BASE
    for x in range(2, 8):
        px[x, 4] = OUTLINE
        px[x, 17] = SUIT_DK
    for y in range(4, 18):
        px[2, y] = OUTLINE
        px[7, y] = OUTLINE
    # Seat (rows 18..24)
    for y in range(18, 25):
        for x in range(2, 14):
            px[x, y] = SUIT_BASE
    for x in range(2, 14):
        px[x, 18] = OUTLINE
        px[x, 24] = SUIT_DK
    for y in range(18, 25):
        px[2, y] = OUTLINE
        px[13, y] = OUTLINE
    # Armrest at right (front)
    for y in range(12, 22):
        for x in range(11, 14):
            px[x, y] = SUIT_DK
    for x in range(11, 14):
        px[x, 12] = OUTLINE
    for y in range(12, 22):
        px[14, y] = OUTLINE
    return img


def furniture_coffee_table() -> Image.Image:
    """32x32 — lounge coffee table (2w × 2h)."""
    img = _new(32, 32); px = img.load()
    # Top (rows 4..12)
    for y in range(6, 14):
        for x in range(2, 30):
            px[x, y] = WOOD_BASE
    for x in range(2, 30):
        px[x, 6] = WOOD_DARK
        px[x, 13] = OUTLINE
    for y in range(6, 14):
        px[2, y] = WOOD_DARK
        px[29, y] = WOOD_DARK
    for x in range(3, 29):
        px[x, 7] = WOOD_LITE
    # Magazine on top
    for y in range(9, 12):
        for x in range(8, 18):
            px[x, y] = PAINT_RED
    px[8, 9] = OUTLINE; px[17, 9] = OUTLINE
    for x in range(9, 17):
        px[x, 10] = SHIRT_WT
    # Coffee cup
    for y in range(8, 12):
        for x in range(21, 25):
            px[x, y] = SHIRT_WT
    px[21, 8] = OUTLINE; px[24, 8] = OUTLINE
    px[21, 11] = OUTLINE; px[24, 11] = OUTLINE
    # Cup handle
    px[25, 9] = OUTLINE; px[25, 10] = OUTLINE
    # Cup interior dark
    px[22, 9] = (62, 40, 28, 255); px[23, 9] = (62, 40, 28, 255)
    # Legs (rows 13..30)
    for x_pair in ((4, 6), (26, 28)):
        for y in range(14, 30):
            for x in range(x_pair[0], x_pair[1] + 1):
                px[x, y] = WOOD_DARK
        for x in range(x_pair[0], x_pair[1] + 1):
            px[x, 30] = OUTLINE
    return img


def furniture_coffee_maker() -> Image.Image:
    """16x16 — vending machine (since this overlaps as 'coffee')."""
    img = _new(16, 16); px = img.load()
    # Body
    for y in range(0, 16):
        for x in range(1, 15):
            px[x, y] = PAINT_RED
    for x in range(1, 15):
        px[x, 0] = OUTLINE
        px[x, 15] = OUTLINE
    for y in range(16):
        px[1, y] = OUTLINE
        px[14, y] = OUTLINE
    # Display window (top)
    for y in range(2, 7):
        for x in range(3, 13):
            px[x, y] = GLASS_BASE
    for x in range(3, 13):
        px[x, 2] = OUTLINE; px[x, 6] = OUTLINE
    for y in range(2, 7):
        px[3, y] = OUTLINE; px[12, y] = OUTLINE
    # Drink bottles
    for x in (5, 7, 9, 11):
        for y in range(3, 6):
            px[x, y] = PAINT_JADE if (x % 4 == 1) else PAINT_GOLD
    # Brand stripe
    for x in range(3, 13):
        px[x, 8] = SHIRT_WT
    for x in (5, 7, 9):
        px[x, 8] = OUTLINE
    # Coin slot
    px[11, 10] = OUTLINE; px[12, 10] = OUTLINE
    # Buttons
    for y in (10, 12):
        for x in (3, 5, 7, 9):
            px[x, y] = METAL_BASE
    # Dispenser
    for x in range(4, 12):
        px[x, 14] = OUTLINE
        px[x, 13] = METAL_DARK
    return img


def furniture_bin() -> Image.Image:
    """16x16 — standing ashtray (smoking corner) or wastebasket."""
    img = _new(16, 16); px = img.load()
    # Tall narrow cylinder
    for y in range(4, 16):
        for x in range(5, 11):
            px[x, y] = METAL_BASE
    for x in range(5, 11):
        px[x, 4] = OUTLINE
        px[x, 15] = OUTLINE
    for y in range(4, 16):
        px[5, y] = OUTLINE
        px[10, y] = OUTLINE
    # Side highlight
    for y in range(5, 15):
        px[6, y] = METAL_LITE
    # Top ashtray dish
    for x in range(3, 13):
        px[x, 3] = METAL_DARK
        px[x, 2] = OUTLINE
    for x in range(3, 13):
        px[x, 4] = METAL_BLACK
    # Cigarette butt
    px[7, 3] = SHIRT_WT
    px[8, 3] = (212, 80, 60, 255)
    # Wisp
    px[8, 1] = SMOKE_LT
    px[9, 0] = SMOKE_MD
    return img


def furniture_cushioned_bench() -> Image.Image:
    """16x16 — waiting bench seat."""
    img = _new(16, 16); px = img.load()
    # Cushion
    for y in range(2, 10):
        for x in range(1, 15):
            px[x, y] = SUIT_BASE
    for x in range(1, 15):
        px[x, 2] = OUTLINE
        px[x, 9] = SUIT_DK
    for y in range(2, 10):
        px[1, y] = OUTLINE
        px[14, y] = OUTLINE
    for x in range(2, 14):
        px[x, 3] = SUIT_LT
    # Backrest hint
    for x in range(1, 15):
        px[x, 0] = SUIT_DK
        px[x, 1] = SUIT_BASE
    # Legs
    for y in range(10, 15):
        px[2, y] = METAL_BASE
        px[13, y] = METAL_BASE
    for x in (2, 13):
        px[x, 15] = OUTLINE
    return img


def furniture_small_table_front() -> Image.Image:
    """32x32 — small side table (2w × 2h) with telephone."""
    img = _new(32, 32); px = img.load()
    # Top
    for y in range(8, 16):
        for x in range(2, 30):
            px[x, y] = WOOD_BASE
    for x in range(2, 30):
        px[x, 8] = WOOD_DARK
        px[x, 15] = OUTLINE
    for y in range(8, 16):
        px[2, y] = WOOD_DARK
        px[29, y] = WOOD_DARK
    for x in range(3, 29):
        px[x, 9] = WOOD_LITE
    # Telephone (cradle + handset) — classic 1990s push-button office phone
    for y in range(4, 9):
        for x in range(10, 22):
            px[x, y] = METAL_BLACK
    for x in range(10, 22):
        px[x, 4] = OUTLINE
    # Handset on top
    for x in range(12, 20):
        px[x, 3] = METAL_DARK
    px[11, 4] = METAL_DARK; px[20, 4] = METAL_DARK
    # Coiled cord
    for (x, y) in [(20, 6), (21, 7), (20, 8)]:
        px[x, y] = METAL_DARK
    # Keypad dots
    for x in (12, 14, 16, 18):
        px[x, 7] = METAL_BASE
    # Legs (4)
    for x_pair in ((4, 6), (25, 27)):
        for y in range(16, 30):
            for x in range(x_pair[0], x_pair[1] + 1):
                px[x, y] = WOOD_DARK
        for x in range(x_pair[0], x_pair[1] + 1):
            px[x, 30] = OUTLINE
    return img


def furniture_small_table_side() -> Image.Image:
    """16x48 — slim side table from the side (1w × 3h)."""
    img = _new(16, 48); px = img.load()
    # Top
    for y in range(0, 8):
        for x in range(0, 16):
            px[x, y] = WOOD_BASE
    for x in range(16):
        px[x, 0] = WOOD_DARK
        px[x, 7] = OUTLINE
    # Leg
    for y in range(8, 46):
        for x in range(6, 10):
            px[x, y] = WOOD_DARK
    for x in (6, 9):
        for y in range(8, 46):
            px[x, y] = OUTLINE
    # Foot pad
    for x in range(4, 12):
        px[x, 46] = OUTLINE
        px[x, 47] = OUTLINE
    return img


def furniture_clock() -> Image.Image:
    """16x32 — wall clock (1w × 1h with 1-tile overhang upward)."""
    img = _new(16, 32); px = img.load()
    # Clock body (rows 4..20 — visible area)
    for y in range(4, 20):
        for x in range(2, 14):
            px[x, y] = METAL_LITE
    for x in range(2, 14):
        px[x, 4] = OUTLINE
        px[x, 19] = OUTLINE
    for y in range(4, 20):
        px[2, y] = OUTLINE
        px[13, y] = OUTLINE
    # Inner face
    for y in range(6, 18):
        for x in range(4, 12):
            px[x, y] = SHIRT_WT
    for x in range(4, 12):
        px[x, 5] = OUTLINE; px[x, 18] = OUTLINE
    for y in range(6, 18):
        px[4, y] = OUTLINE; px[11, y] = OUTLINE
    # Tick marks
    px[8, 6] = OUTLINE; px[8, 17] = OUTLINE
    px[4, 12] = OUTLINE; px[11, 12] = OUTLINE
    # Hour hand
    px[7, 12] = OUTLINE; px[8, 12] = OUTLINE
    # Minute hand
    px[8, 9] = OUTLINE; px[8, 10] = OUTLINE; px[8, 11] = OUTLINE
    # Center dot
    px[8, 12] = TIE_RED
    return img


def furniture_small_painting() -> Image.Image:
    """16x32 — small Japanese scroll painting (1×1 tile with overhang up)."""
    img = _new(16, 32); px = img.load()
    # Outer frame (rows 0..16)
    for y in range(2, 18):
        for x in range(2, 14):
            px[x, y] = WOOD_DARK
    for x in range(2, 14):
        px[x, 2] = OUTLINE
        px[x, 17] = OUTLINE
    for y in range(2, 18):
        px[2, y] = OUTLINE
        px[13, y] = OUTLINE
    # Inner mat
    for y in range(4, 16):
        for x in range(4, 12):
            px[x, y] = SHIRT_WT
    # Painting — Mount Fuji style
    # Sky
    for y in range(5, 14):
        for x in range(5, 11):
            px[x, y] = (200, 220, 232, 255)
    # Mountain
    for (x, y) in [
        (5, 13), (6, 13), (7, 13), (8, 13), (9, 13), (10, 13),
        (6, 12), (7, 12), (8, 12), (9, 12),
        (7, 11), (8, 11),
    ]:
        px[x, y] = PAINT_INK
    # Snow cap
    px[7, 11] = SHIRT_WT; px[8, 11] = SHIRT_WT
    # Sun
    px[10, 6] = TIE_RED; px[9, 6] = (212, 80, 60, 255)
    return img


def furniture_large_painting() -> Image.Image:
    """32x32 — large landscape painting (2x2 tile with overhang)."""
    img = _new(32, 32); px = img.load()
    # Frame
    for y in range(2, 22):
        for x in range(2, 30):
            px[x, y] = WOOD_DARK
    for x in range(2, 30):
        px[x, 2] = OUTLINE
        px[x, 21] = OUTLINE
    for y in range(2, 22):
        px[2, y] = OUTLINE
        px[29, y] = OUTLINE
    # Mat
    for y in range(4, 20):
        for x in range(4, 28):
            px[x, y] = SHIRT_WT
    # Painting — bamboo/garden scene (jade + ink + sun)
    # Sky
    for y in range(5, 14):
        for x in range(5, 27):
            px[x, y] = (210, 230, 232, 255)
    # Sun (red disk)
    for (dx, dy) in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]:
        px[22 + dx, 8 + dy] = TIE_RED
    # Mountains far
    for x in range(5, 18):
        px[x, 12] = (148, 168, 180, 255)
    # Mountain near
    pyramid_pts = [(8, 13), (9, 12), (10, 11), (11, 12), (12, 13)]
    for (x, y) in pyramid_pts:
        px[x, y] = PAINT_INK
    px[10, 11] = SHIRT_WT
    # Bamboo on right
    for y in range(13, 19):
        px[23, y] = PAINT_JADE
        px[24, y] = LEAF_DK
    for (x, y) in [(22, 14), (25, 15), (22, 17)]:
        px[x, y] = PAINT_JADE
    # Foreground line
    for x in range(5, 27):
        px[x, 19] = WOOD_DARK
    # Signature mark
    px[26, 17] = TIE_RED
    return img


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main() -> None:
    # Floors
    _save(floor_gray_carpet(), "floors", "floor_0.png")
    _save(floor_blue_carpet(), "floors", "floor_1.png")
    _save(floor_linoleum(), "floors", "floor_2.png")
    _save(floor_raised_metal(), "floors", "floor_3.png")
    _save(floor_tatami(), "floors", "floor_4.png")
    _save(floor_bathroom_tile(), "floors", "floor_5.png")
    _save(floor_genkan_stone(), "floors", "floor_6.png")
    _save(floor_concrete(), "floors", "floor_7.png")
    _save(floor_wood_aisle(), "floors", "floor_8.png")

    # Wall
    _save(wall_panel(), "walls", "wall_0.png")

    # Characters — 6 palette variants. Lead (hash→4) and Worker (hash→2) get
    # the most prominent character designs by index 2 and 4.
    palettes = [
        # 0 — gray salaryman
        dict(style='salaryman', suit=(82, 88, 100, 255), suit_dk=(58, 64, 76, 255),
             suit_lt=(112, 118, 130, 255), hair=HAIR_BASE, hair_dk=HAIR_DK,
             skin=SKIN_BASE, skin_dk=SKIN_DK, tie=TIE_NV, has_glasses=False),
        # 1 — brown suit salaryman
        dict(style='salaryman', suit=(96, 72, 48, 255), suit_dk=(64, 48, 32, 255),
             suit_lt=(132, 104, 76, 255), hair=HAIR_BR, hair_dk=HAIR_BR_DK,
             skin=SKIN_BASE, skin_dk=SKIN_DK, tie=TIE_RED, has_glasses=True),
        # 2 — navy salaryman (WORKER often lands here)
        dict(style='salaryman', suit=(56, 72, 108, 255), suit_dk=(36, 50, 80, 255),
             suit_lt=(86, 102, 138, 255), hair=HAIR_BASE, hair_dk=HAIR_DK,
             skin=SKIN_BASE, skin_dk=SKIN_DK, tie=PAINT_GOLD, has_glasses=False),
        # 3 — female OL (navy blazer)
        dict(style='ol', suit=BLAZ_BASE, suit_dk=BLAZ_DK, suit_lt=BLAZ_LT,
             hair=HAIR_BR, hair_dk=HAIR_BR_DK,
             skin=SKIN_LT, skin_dk=SKIN_BASE, tie=TIE_RED),
        # 4 — dark suit salaryman (LEAD lands here)
        dict(style='salaryman', suit=SUIT_BASE, suit_dk=SUIT_DK, suit_lt=SUIT_LT,
             hair=HAIR_DK, hair_dk=OUTLINE,
             skin=SKIN_BASE, skin_dk=SKIN_DK, tie=TIE_RED, has_glasses=True),
        # 5 — female OL variant (charcoal)
        dict(style='ol', suit=(56, 60, 78, 255), suit_dk=(40, 44, 60, 255), suit_lt=(80, 84, 104, 255),
             hair=HAIR_DK, hair_dk=OUTLINE,
             skin=SKIN_LT, skin_dk=SKIN_BASE, tie=TIE_NV),
    ]
    for i, p in enumerate(palettes):
        style = p.pop('style')
        if style == 'salaryman':
            img = make_character(
                'salaryman',
                p['suit'], p['suit_dk'], p['suit_lt'],
                p['hair'], p['hair_dk'],
                p['skin'], p['skin_dk'],
                p['tie'], p.get('has_glasses', False),
            )
        else:
            img = make_character(
                'ol',
                p['suit'], p['suit_dk'], p['suit_lt'],
                p['hair'], p['hair_dk'],
                p['skin'], p['skin_dk'],
                p['tie'],
            )
        _save(img, "characters", f"char_{i}.png")

    # Furniture
    _save(furniture_desk_front(), "furniture", "DESK", "DESK_FRONT.png")
    _save(furniture_desk_side(), "furniture", "DESK", "DESK_SIDE.png")
    _save(furniture_pc_front(), "furniture", "PC", "PC_FRONT_OFF.png")
    _save(furniture_pc_front(), "furniture", "PC", "PC_FRONT_ON_1.png")
    _save(furniture_pc_front(), "furniture", "PC", "PC_FRONT_ON_2.png")
    _save(furniture_pc_front(), "furniture", "PC", "PC_FRONT_ON_3.png")
    _save(furniture_pc_back(), "furniture", "PC", "PC_BACK.png")
    _save(furniture_pc_side(), "furniture", "PC", "PC_SIDE.png")
    _save(furniture_chair_front(), "furniture", "WOODEN_CHAIR", "WOODEN_CHAIR_FRONT.png")
    _save(furniture_chair_back(), "furniture", "WOODEN_CHAIR", "WOODEN_CHAIR_BACK.png")
    _save(furniture_chair_side(), "furniture", "WOODEN_CHAIR", "WOODEN_CHAIR_SIDE.png")
    _save(furniture_table_front(), "furniture", "TABLE_FRONT", "TABLE_FRONT.png")
    _save(furniture_whiteboard(), "furniture", "WHITEBOARD", "WHITEBOARD.png")
    _save(furniture_bookshelf(), "furniture", "BOOKSHELF", "BOOKSHELF.png")
    _save(furniture_double_bookshelf(), "furniture", "DOUBLE_BOOKSHELF", "DOUBLE_BOOKSHELF.png")
    _save(furniture_plant_small(), "furniture", "PLANT", "PLANT.png")
    _save(furniture_plant_small(), "furniture", "PLANT_2", "PLANT_2.png")
    _save(furniture_plant_large(), "furniture", "LARGE_PLANT", "LARGE_PLANT.png")
    _save(furniture_hanging_plant(), "furniture", "HANGING_PLANT", "HANGING_PLANT.png")
    _save(furniture_cactus(), "furniture", "CACTUS", "CACTUS.png")
    _save(furniture_sofa_front(), "furniture", "SOFA", "SOFA_FRONT.png")
    _save(furniture_sofa_back(), "furniture", "SOFA", "SOFA_BACK.png")
    _save(furniture_sofa_side(), "furniture", "SOFA", "SOFA_SIDE.png")
    _save(furniture_coffee_table(), "furniture", "COFFEE_TABLE", "COFFEE_TABLE.png")
    _save(furniture_coffee_maker(), "furniture", "COFFEE", "COFFEE.png")
    _save(furniture_bin(), "furniture", "BIN", "BIN.png")
    _save(furniture_cushioned_bench(), "furniture", "CUSHIONED_BENCH", "CUSHIONED_BENCH.png")
    # Cushioned chair (smaller) — reuse cushioned bench art
    _save(furniture_cushioned_bench(), "furniture", "CUSHIONED_CHAIR", "CUSHIONED_CHAIR_FRONT.png")
    _save(furniture_cushioned_bench(), "furniture", "CUSHIONED_CHAIR", "CUSHIONED_CHAIR_BACK.png")
    _save(furniture_cushioned_bench(), "furniture", "CUSHIONED_CHAIR", "CUSHIONED_CHAIR_SIDE.png")
    _save(furniture_small_table_front(), "furniture", "SMALL_TABLE", "SMALL_TABLE_FRONT.png")
    _save(furniture_small_table_side(), "furniture", "SMALL_TABLE", "SMALL_TABLE_SIDE.png")
    # Wooden bench (small) — reuse cushioned bench art
    _save(furniture_cushioned_bench(), "furniture", "WOODEN_BENCH", "WOODEN_BENCH.png")
    # Pot (small) — reuse small plant
    _save(furniture_plant_small(), "furniture", "POT", "POT.png")
    _save(furniture_clock(), "furniture", "CLOCK", "CLOCK.png")
    _save(furniture_small_painting(), "furniture", "SMALL_PAINTING", "SMALL_PAINTING.png")
    _save(furniture_small_painting(), "furniture", "SMALL_PAINTING_2", "SMALL_PAINTING_2.png")
    _save(furniture_large_painting(), "furniture", "LARGE_PAINTING", "LARGE_PAINTING.png")

    print("Generated all Japanese office sprites.")


if __name__ == "__main__":
    main()
