import {
  CharacterState,
  TILE_SIZE,
  TileType,
  type EngineCharacter,
  type FurnitureInstance,
  type OfficeLayout,
  type SpriteManager,
  type TaskPulse,
} from './types';
import { spriteFrameIndex } from './sprites';
import type { Camera } from './camera';

export interface RenderOptions {
  layout: OfficeLayout;
  characters: EngineCharacter[];
  sprites: SpriteManager;
  darkMode: boolean;
  camera: Camera;
  /** Role of the currently hovered character, if any. */
  hoveredRole?: string | null;
  taskPulses?: TaskPulse[];
  nowMs?: number;
}

interface Drawable {
  /** Y used for depth sorting (bottom of sprite). */
  zY: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

const CANVAS_LABEL_FONT = '"Geist Mono", ui-monospace, monospace';
const CANVAS_DISPLAY_FONT = '"LCT Ciburial", "Geist Mono", sans-serif';

function canvasFont(sizePx: number, family = CANVAS_LABEL_FONT, weight = 600): string {
  return `${weight} ${sizePx}px ${family}`;
}

function drawTiled(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
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

function drawWorkshopPropFallback(
  ctx: CanvasRenderingContext2D,
  f: FurnitureInstance,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): boolean {
  if (f.kind !== 'queue_board' && f.kind !== 'status_wall' && f.kind !== 'review_terminal') return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const frame = f.kind === 'review_terminal' ? '#34465f' : '#5a3b24';
  const face = f.kind === 'status_wall' ? '#14372f' : f.kind === 'queue_board' ? '#1f2b45' : '#0b1826';
  ctx.fillStyle = frame;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.fillStyle = face;
  ctx.fillRect(dx + 2, dy + 2, Math.max(0, dw - 4), Math.max(0, dh - 4));
  ctx.fillStyle = f.kind === 'status_wall' ? '#54d48a' : '#ffd166';
  const rows = f.kind === 'review_terminal' ? 3 : 4;
  for (let i = 0; i < rows; i++) {
    const y = dy + 5 + i * 5;
    ctx.fillRect(dx + 5, y, Math.max(4, dw - 12 - i * 3), 2);
  }
  if (f.kind === 'queue_board') {
    ctx.fillStyle = '#ef476f';
    ctx.fillRect(dx + dw - 8, dy + 5, 3, 3);
    ctx.fillStyle = '#06d6a0';
    ctx.fillRect(dx + dw - 8, dy + 11, 3, 3);
  }
  if (f.kind === 'review_terminal') {
    ctx.fillStyle = '#8ecae6';
    ctx.fillRect(dx + 6, dy + dh - 7, dw - 12, 2);
  }
  ctx.restore();
  return true;
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
  let flipX = false;
  switch (f.kind) {
    case 'desk':
      img = f.variant === 'side' ? sprites.furniture.desk.side : sprites.furniture.desk.front;
      break;
    case 'pc':
      if (f.variant === 'back') img = sprites.furniture.pc.back;
      else if (f.variant === 'side') img = sprites.furniture.pc.side;
      else if (f.variant === 'side-mirror') {
        img = sprites.furniture.pc.side;
        flipX = true;
      } else img = sprites.furniture.pc.front;
      break;
    case 'chair':
      if (f.variant === 'back') img = sprites.furniture.chair.back;
      else if (f.variant === 'side') img = sprites.furniture.chair.side;
      else if (f.variant === 'side-mirror') {
        img = sprites.furniture.chair.side;
        flipX = true;
      } else img = sprites.furniture.chair.front;
      break;
    case 'table':
      img = sprites.furniture.table.front;
      break;
    case 'whiteboard':
      img = sprites.furniture.whiteboard;
      break;
    case 'bookshelf':
      img = sprites.furniture.bookshelf;
      break;
    case 'double_bookshelf':
      img = sprites.furniture.doubleBookshelf;
      break;
    case 'plant':
      img = sprites.furniture.plant;
      break;
    case 'large_plant':
      img = sprites.furniture.largePlant;
      break;
    case 'hanging_plant':
      img = sprites.furniture.hangingPlant;
      break;
    case 'cactus':
      img = sprites.furniture.cactus;
      break;
    case 'sofa':
      if (f.variant === 'back') img = sprites.furniture.sofa.back;
      else if (f.variant === 'side') img = sprites.furniture.sofa.side;
      else if (f.variant === 'side-mirror') {
        img = sprites.furniture.sofa.side;
        flipX = true;
      } else img = sprites.furniture.sofa.front;
      break;
    case 'coffee_table':
      img = sprites.furniture.coffeeTable;
      break;
    case 'coffee':
      img = sprites.furniture.coffee;
      break;
    case 'bin':
      img = sprites.furniture.bin;
      break;
    case 'cushioned_bench':
      img = sprites.furniture.cushionedBench;
      break;
    case 'small_table':
      img = f.variant === 'side' ? sprites.furniture.smallTable.side : sprites.furniture.smallTable.front;
      break;
    case 'clock':
      img = sprites.furniture.clock;
      break;
    case 'small_painting':
      img = sprites.furniture.smallPainting;
      break;
    case 'large_painting':
      img = sprites.furniture.largePainting;
      break;
  }
  if (!img && drawWorkshopPropFallback(ctx, f, dx, dy, dw, dh)) {
    return;
  }
  if (img) {
    if (flipX) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
    }
  } else {
    ctx.fillStyle = f.kind === 'desk' || f.kind === 'table' ? '#8a5a2b' : '#444';
    ctx.fillRect(dx, dy, dw, dh);
  }
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  c: EngineCharacter,
  sprites: SpriteManager,
  highlighted: boolean,
): void {
  const sheet = sprites.characters[c.palette];
  if (!sheet) {
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

  const px = Math.round(c.x);
  const py = Math.round(c.y);

  if (highlighted) {
    // Soft outline ring for hover affordance.
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = c.profile.color;
    const ringR = sprites.charFrameW / 2 - 1;
    const cx = px + sprites.charFrameW / 2;
    const cy = py + sprites.charFrameH - 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ringR, ringR * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.drawImage(frame, px, py);

  if (c.isBlocked && c.flashTimer < 0.5) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(px, py, sprites.charFrameW, sprites.charFrameH);
    ctx.restore();
  }
}

function drawTaskPulse(
  ctx: CanvasRenderingContext2D,
  pulse: TaskPulse,
  characters: EngineCharacter[],
  nowMs: number,
  darkMode: boolean,
): void {
  const to = characters.find((c) => c.role === pulse.toRole);
  if (!to) return;
  const from = pulse.fromRole ? characters.find((c) => c.role === pulse.fromRole) : null;
  const elapsed = nowMs - pulse.startedAt;
  const t = Math.min(Math.max(elapsed / pulse.durationMs, 0), 1);
  const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const targetX = to.x + 8;
  const targetY = to.y + 2;

  ctx.save();
  if (pulse.kind === 'complete') {
    const radius = 4 + t * 13;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(targetX, targetY + 10, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.font = canvasFont(8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('done', targetX, targetY - 4 - t * 8);
    ctx.restore();
    return;
  }

  const startX = from ? from.x + 8 : targetX - 36;
  const startY = from ? from.y + 2 : targetY - 10;
  const arc = Math.sin(Math.PI * ease) * 18;
  const x = startX + (targetX - startX) * ease;
  const y = startY + (targetY - startY) * ease - arc;
  ctx.globalAlpha = Math.sin(Math.PI * Math.min(t, 0.98));
  ctx.fillStyle = darkMode ? '#f8fafc' : '#fffdf5';
  ctx.strokeStyle = darkMode ? '#0f172a' : '#3f3420';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - 5, y - 4, 10, 8, 1.5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(x - 2, y - 1, 4, 1);
  ctx.restore();
}


function drawActivityBubble(
  ctx: CanvasRenderingContext2D,
  c: EngineCharacter,
  darkMode: boolean,
): void {
  if (!c.currentActivity || c.actionTimer <= 0) return;
  const label = c.currentActivity.label;
  ctx.save();
  ctx.font = canvasFont(8, CANVAS_DISPLAY_FONT, 400);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const cx = c.x + 8;
  const y = c.y - 11;
  const width = Math.max(34, Math.min(82, ctx.measureText(label).width + 10));
  ctx.fillStyle = darkMode ? 'rgba(15,23,42,0.88)' : 'rgba(255,253,245,0.92)';
  ctx.strokeStyle = c.profile.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cx - width / 2, y - 6, width, 12, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = darkMode ? '#f8fafc' : '#3f3420';
  ctx.fillText(label, cx, y + 0.5, width - 8);
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
  ctx.font = canvasFont(8);
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
  const { layout, characters, sprites, darkMode, camera, hoveredRole, taskPulses = [], nowMs = 0 } = opts;
  const canvas = ctx.canvas;
  const canvasW = canvas.width;
  const canvasH = canvas.height;

  // 1) Clear letterbox area in screen space.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = darkMode ? '#06090a' : '#1c1a14';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.restore();

  // 2) Apply uniform world→screen transform. Render factor folds in DPR so
  //    pixels land on the backing store at the same logical position.
  const { scale, offsetX, offsetY, dpr } = camera;
  const renderScale = scale * dpr;
  const renderOffsetX = offsetX * dpr;
  const renderOffsetY = offsetY * dpr;
  const renderedW = camera.width * scale * dpr;
  const renderedH = camera.height * scale * dpr;

  ctx.save();
  // Clip world rendering to the view rect (backing px) so sprites can't bleed
  // into the letterbox bars.
  ctx.beginPath();
  ctx.rect(renderOffsetX, renderOffsetY, renderedW, renderedH);
  ctx.clip();

  ctx.setTransform(
    renderScale, 0, 0, renderScale,
    renderOffsetX - camera.x * renderScale,
    renderOffsetY - camera.y * renderScale,
  );
  ctx.imageSmoothingEnabled = false;

  // World background fills the view rect (covers everything outside the map).
  ctx.fillStyle = darkMode ? '#0e1411' : '#f3f0e8';
  ctx.fillRect(camera.x, camera.y, camera.width, camera.height);

  // Only draw tiles that intersect the view rect — cheap culling.
  const minCol = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const maxCol = Math.min(layout.cols - 1, Math.floor((camera.x + camera.width - 1) / TILE_SIZE));
  const minRow = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const maxRow = Math.min(layout.rows - 1, Math.floor((camera.y + camera.height - 1) / TILE_SIZE));

  const floorImages = sprites.floor;
  const floorFallback = floorImages[0] ?? null;
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const tile = layout.tiles[r][c];
      if (tile === TileType.FLOOR) {
        const variantIdx = layout.floorVariants[r]?.[c] ?? 0;
        const img = floorImages[variantIdx] ?? floorFallback;
        drawFloorTile(ctx, img, c * TILE_SIZE, r * TILE_SIZE, darkMode);
      }
    }
  }
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const tile = layout.tiles[r][c];
      if (tile === TileType.WALL) {
        drawWallTile(ctx, sprites.wall, c * TILE_SIZE, r * TILE_SIZE, darkMode);
      }
    }
  }

  // Build z-sorted drawables (furniture + characters). Don't bother culling
  // furniture — instance count is small.
  const drawables: Drawable[] = [];
  for (const f of layout.furniture) {
    const zY = (f.row + f.h) * TILE_SIZE;
    drawables.push({
      zY,
      draw: (g) => drawFurnitureSprite(g, f, sprites),
    });
  }
  for (const c of characters) {
    const zY = c.y + sprites.charFrameH;
    drawables.push({
      zY,
      draw: (g) => drawCharacter(g, c, sprites, hoveredRole === c.role),
    });
  }
  drawables.sort((a, b) => a.zY - b.zY);
  for (const d of drawables) d.draw(ctx);

  for (const pulse of taskPulses) drawTaskPulse(ctx, pulse, characters, nowMs, darkMode);

  // Activity and state bubbles on top of world content.
  for (const c of characters) drawActivityBubble(ctx, c, darkMode);
  for (const c of characters) drawStateBubble(ctx, c);

  ctx.restore();

  // 3) Subtle scanline overlay in screen space, after camera transform reset.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  for (let y = 0; y < canvasH; y += 2) ctx.fillRect(0, y, canvasW, 1);
  ctx.restore();
}
