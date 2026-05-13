/**
 * Camera/viewport over the native map. All coords are in native map pixels.
 *
 * The camera defines which rectangular region of the map is visible. The
 * renderer scales this region to fill the canvas, so tile size on screen
 * stays consistent regardless of canvas size: small canvas → camera shows
 * a smaller portion of the map; large canvas → camera shows more (and
 * everything stays the same number of CSS pixels per tile).
 */
export interface Camera {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Create a camera sized to the canvas, clamped to the map bounds. */
export function createCamera(
  canvasWidth: number,
  canvasHeight: number,
  mapPixelW: number,
  mapPixelH: number,
): Camera {
  const w = Math.min(canvasWidth, mapPixelW);
  const h = Math.min(canvasHeight, mapPixelH);
  const x = clamp((mapPixelW - w) / 2, 0, Math.max(0, mapPixelW - w));
  const y = clamp((mapPixelH - h) / 2, 0, Math.max(0, mapPixelH - h));
  return { x, y, width: w, height: h };
}

/**
 * Pan the camera so (targetX, targetY) is centered, clamped to map bounds.
 * Both inputs and the resulting camera are in native map pixel space.
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
  cam.x = clamp(targetX - cam.width / 2, 0, maxX);
  cam.y = clamp(targetY - cam.height / 2, 0, maxY);
}

/** Resize a camera (e.g. after canvas resize). Keeps it centered on its previous center. */
export function resizeCamera(
  cam: Camera,
  canvasWidth: number,
  canvasHeight: number,
  mapPixelW: number,
  mapPixelH: number,
): void {
  const cx = cam.x + cam.width / 2;
  const cy = cam.y + cam.height / 2;
  cam.width = Math.min(canvasWidth, mapPixelW);
  cam.height = Math.min(canvasHeight, mapPixelH);
  updateCamera(cam, cx, cy, mapPixelW, mapPixelH);
}

/** Convert native-map world coords to screen coords given the canvas size. */
export function worldToScreen(
  cam: Camera,
  worldX: number,
  worldY: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const sx = (worldX - cam.x) * (canvasWidth / cam.width);
  const sy = (worldY - cam.y) * (canvasHeight / cam.height);
  return { x: sx, y: sy };
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}
