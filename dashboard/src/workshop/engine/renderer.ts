import {
  CharacterState,
  TILE_SIZE,
  TileType,
  type EngineCharacter,
  type FurnitureInstance,
  type OfficeLayout,
  type SpriteManager,
} from './types';
import { spriteFrameIndex } from './sprites';

export interface RenderOptions {
  layout: OfficeLayout;
  characters: EngineCharacter[];
  sprites: SpriteManager;
  darkMode: boolean;
}

interface Drawable {
  /** Y used for depth sorting (bottom of sprite). */
  zY: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

function drawTiled(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  // Use top-left 16x16 if image is larger than a tile.
  const sw = Math.min(img.width, TILE_SIZE);
  const sh = Math.min(img.height, TILE_SIZE);
  ctx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh);
}

function drawWallTile(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  dx: number,
  dy: number,
  darkMode: boolean,
): void {
  if (img) {
    drawTiled(ctx, img, dx, dy, TILE_SIZE, TILE_SIZE);
    if (darkMode) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
    }
  } else {
    ctx.fillStyle = darkMode ? '#252b27' : '#bdb59a';
    ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
  }
}

function drawFloorTile(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  dx: number,
  dy: number,
  darkMode: boolean,
): void {
  if (img) {
    drawTiled(ctx, img, dx, dy, TILE_SIZE, TILE_SIZE);
    if (darkMode) {
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
    }
  } else {
    ctx.fillStyle = darkMode ? '#1c241f' : '#e2dcc7';
    ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
  }
}

function drawFurnitureSprite(
  ctx: CanvasRenderingContext2D,
  f: FurnitureInstance,
  sprites: SpriteManager,
): void {
  const overhang = f.spriteOverhangRows ?? 0;
  const dx = f.col * TILE_SIZE;
  const dy = (f.row - overhang) * TILE_SIZE;
  const dw = f.w * TILE_SIZE;
  const dh = (f.h + overhang) * TILE_SIZE;

  let img: HTMLImageElement | null = null;
  switch (f.kind) {
    case 'desk':
      img = sprites.furniture.desk.front;
      break;
    case 'pc':
      img = f.variant === 'back' ? sprites.furniture.pc.back : sprites.furniture.pc.front;
      break;
    case 'chair':
      img = f.variant === 'back' ? sprites.furniture.chair.back : sprites.furniture.chair.front;
      break;
    case 'table':
      img = sprites.furniture.table.front;
      break;
  }
  if (img) {
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    // Fallback placeholder.
    ctx.fillStyle = f.kind === 'desk' || f.kind === 'table' ? '#8a5a2b' : '#444';
    ctx.fillRect(dx, dy, dw, dh);
  }
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  c: EngineCharacter,
  sprites: SpriteManager,
): void {
  const sheet = sprites.characters[c.palette];
  if (!sheet) {
    // Fallback square so something is visible
    ctx.fillStyle = c.profile.color;
    ctx.fillRect(c.x + 2, c.y + 12, 12, 18);
    return;
  }
  const state: 'idle' | 'walk' | 'type' | 'read' =
    c.state === CharacterState.WALK
      ? 'walk'
      : c.state === CharacterState.TYPE
        ? 'type'
        : c.state === CharacterState.READ
          ? 'read'
          : 'idle';
  const dir = c.dir as 0 | 1 | 2 | 3;
  const frameIdx = spriteFrameIndex(state, c.frame);
  const frame = sheet.byDirFrame[dir]?.[frameIdx];
  if (!frame) return;

  // Flash red overlay when blocked.
  ctx.drawImage(frame, Math.round(c.x), Math.round(c.y));

  if (c.isBlocked && (c.flashTimer < 0.5)) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(Math.round(c.x), Math.round(c.y), sprites.charFrameW, sprites.charFrameH);
    ctx.restore();
  }
}

function drawNameLabel(
  ctx: CanvasRenderingContext2D,
  c: EngineCharacter,
): void {
  const text = c.profile.displayName;
  ctx.save();
  ctx.font = '6px monospace';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'center';
  const cx = c.x + 8;
  const ly = c.y - 1;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width) + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(Math.round(cx - w / 2), Math.round(ly - 7), w, 7);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, Math.round(cx), Math.round(ly - 1));
  ctx.restore();
}

function drawStateBubble(
  ctx: CanvasRenderingContext2D,
  c: EngineCharacter,
): void {
  let glyph = '';
  switch (c.roomState) {
    case 'dispatching':
      glyph = '!';
      break;
    case 'reviewing':
      glyph = '?';
      break;
    case 'responding':
      glyph = '↩';
      break;
    case 'blocked':
      glyph = '×';
      break;
    default:
      return;
  }
  ctx.save();
  ctx.font = '8px monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const cx = c.x + 8;
  const by = c.y - 6;
  ctx.fillStyle = c.isBlocked ? '#dc2626' : c.profile.color;
  ctx.beginPath();
  ctx.arc(cx, by, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(glyph, cx, by + 0.5);
  ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, opts: RenderOptions): void {
  const { layout, characters, sprites, darkMode } = opts;
  const W = layout.cols * TILE_SIZE;
  const H = layout.rows * TILE_SIZE;

  // Clear
  ctx.fillStyle = darkMode ? '#0e1411' : '#f3f0e8';
  ctx.fillRect(0, 0, W, H);

  // Floor tiles
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      if (layout.tiles[r][c] === TileType.FLOOR) {
        drawFloorTile(ctx, sprites.floor, c * TILE_SIZE, r * TILE_SIZE, darkMode);
      }
    }
  }

  // Wall tiles
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      if (layout.tiles[r][c] === TileType.WALL) {
        drawWallTile(ctx, sprites.wall, c * TILE_SIZE, r * TILE_SIZE, darkMode);
      }
    }
  }

  // Build z-sorted drawables (furniture + characters).
  const drawables: Drawable[] = [];
  for (const f of layout.furniture) {
    const zY = (f.row + f.h) * TILE_SIZE;
    drawables.push({
      zY,
      draw: (c) => drawFurnitureSprite(c, f, sprites),
    });
  }
  for (const c of characters) {
    const zY = c.y + sprites.charFrameH;
    drawables.push({
      zY,
      draw: (g) => drawCharacter(g, c, sprites),
    });
  }
  drawables.sort((a, b) => a.zY - b.zY);
  for (const d of drawables) d.draw(ctx);

  // Labels and bubbles on top.
  for (const c of characters) {
    drawNameLabel(ctx, c);
    drawStateBubble(ctx, c);
  }

  // Subtle scanline overlay for retro vibe.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  ctx.restore();
}
