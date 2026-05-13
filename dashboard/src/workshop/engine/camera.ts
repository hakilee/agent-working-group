/**
 * Camera / viewport.
 *
 * The camera defines an axis-aligned rectangle in world (map-pixel) space and
 * a uniform scale from world pixels → logical (CSS) screen pixels.
 * The renderer multiplies by `dpr` to draw into the backing store. A single
 * uniform scale is used in both axes so pixels are always square — no
 * axis-independent stretching. When the view doesn't cover the canvas,
 * letterbox/pillarbox bars fill the remainder.
 */
export interface Camera {
  /** View rect top-left in world (map-pixel) coords. */
  x: number;
  y: number;
  /** View rect size in world pixels. */
  width: number;
  height: number;
  /** Uniform world-px → logical (CSS) px scale. */
  scale: number;
  /** CSS-pixel offset from canvas top-left to view rect's top-left. */
  offsetX: number;
  offsetY: number;
  /** Last logical canvas size used to compute this camera. */
  cssW: number;
  cssH: number;
  /** Device pixel ratio the renderer should multiply by for backing-store output. */
  dpr: number;
}

/**
 * Minimum world region (in world px) to keep visible. We never scale up so
 * much that fewer than this many world pixels fit on screen — past that we
 * letterbox instead.
 */
const MIN_VISIBLE_W_PX = 640; // 40 tiles at 16 px
const MIN_VISIBLE_H_PX = 416; // 26 tiles at 16 px
const MAX_GATHER_SCALE = 1.5;

/** Create a camera sized to the canvas (logical/CSS pixels). */
export function createCamera(
  cssWidth: number,
  cssHeight: number,
  mapPixelW: number,
  mapPixelH: number,
  dpr = 1,
): Camera {
  const cam: Camera = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    cssW: 0,
    cssH: 0,
    dpr: 1,
  };
  resizeCamera(cam, cssWidth, cssHeight, mapPixelW, mapPixelH, dpr);
  return cam;
}

/**
 * Resize the camera. Picks a capped Gather-like scale so more tiles stay
 * visible, then sizes the view rect to the canvas
 * (clamped to the map). Preserves the camera's previous world-space center.
 */
export function resizeCamera(
  cam: Camera,
  cssWidth: number,
  cssHeight: number,
  mapPixelW: number,
  mapPixelH: number,
  dpr = 1,
): void {
  const cw = Math.max(1, cssWidth);
  const ch = Math.max(1, cssHeight);

  const rawScale = Math.min(cw / MIN_VISIBLE_W_PX, ch / MIN_VISIBLE_H_PX);
  const scale = Math.max(1, Math.min(MAX_GATHER_SCALE, Math.floor(rawScale * 2) / 2));

  const viewW = Math.min(cw / scale, mapPixelW);
  const viewH = Math.min(ch / scale, mapPixelH);

  const renderedW = viewW * scale;
  const renderedH = viewH * scale;
  const offsetX = Math.floor((cw - renderedW) / 2);
  const offsetY = Math.floor((ch - renderedH) / 2);

  const cx = cam.width > 0 ? cam.x + cam.width / 2 : mapPixelW / 2;
  const cy = cam.height > 0 ? cam.y + cam.height / 2 : mapPixelH / 2;

  cam.width = viewW;
  cam.height = viewH;
  cam.scale = scale;
  cam.offsetX = offsetX;
  cam.offsetY = offsetY;
  cam.cssW = cw;
  cam.cssH = ch;
  cam.dpr = Math.max(1, dpr);

  updateCamera(cam, cx, cy, mapPixelW, mapPixelH);
}

/**
 * Pan camera so (targetX, targetY) is the view-center, clamped to map bounds.
 * View origin is rounded to whole world pixels to keep blits crisp.
 */
export function updateCamera(
  cam: Camera,
  targetX: number,
  targetY: number,
  mapPixelW: number,
  mapPixelH: number,
): void {
  const maxX = Math.max(0, mapPixelW - cam.width);
  const maxY = Math.max(0, mapPixelH - cam.height);
  const x = clamp(targetX - cam.width / 2, 0, maxX);
  const y = clamp(targetY - cam.height / 2, 0, maxY);
  cam.x = Math.round(x);
  cam.y = Math.round(y);
}

/** Map world-pixel coords → logical (CSS) canvas-pixel coords. */
export function worldToScreen(
  cam: Camera,
  worldX: number,
  worldY: number,
): { x: number; y: number } {
  return {
    x: cam.offsetX + (worldX - cam.x) * cam.scale,
    y: cam.offsetY + (worldY - cam.y) * cam.scale,
  };
}

/** Map logical (CSS) canvas-pixel coords → world-pixel coords. */
export function screenToWorld(
  cam: Camera,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  return {
    x: (screenX - cam.offsetX) / cam.scale + cam.x,
    y: (screenY - cam.offsetY) / cam.scale + cam.y,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}
