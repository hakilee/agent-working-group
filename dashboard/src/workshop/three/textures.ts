import * as THREE from 'three';

const WORKSHOP_ASSET_REV = 'gather-office-v4';

function assetUrl(path: string): string {
  return `${path}?v=${WORKSHOP_ASSET_REV}`;
}

/** Frame W/H for a single character sprite within the 10x3 sheet. */
export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 32;
/** 10 frames wide x 3 directions tall (down/up/right). LEFT is RIGHT flipped. */
export const CHAR_FRAMES_PER_DIR = 10;
export const CHAR_DIRS_IN_SHEET = 3;
export const CHAR_PALETTE_COUNT = 6;
export const FLOOR_VARIANT_COUNT = 9;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image ${src}`));
    img.src = src;
  });
}

function loadImageOptional(src: string): Promise<HTMLImageElement | null> {
  return loadImage(src).catch(() => null);
}

/** Build a Three.js texture from an HTMLImageElement with crisp pixel-art
 *  settings. Returns null if the image is null. */
export function pixelTextureFromImage(img: HTMLImageElement | null): THREE.Texture | null {
  if (!img) return null;
  const tex = new THREE.Texture(img);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function pixelTextureFromCanvas(canvas: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function makeGatherPropTexture(kind: 'queue_board' | 'status_wall' | 'review_terminal' | 'window_panel' | 'wall_panel' | 'door_frame' | 'maker_bench' | 'plaza_planter' | 'garden_bed' | 'tool_cabinet' | 'parts_shelf' | 'cable_spool' | 'hazard_barrel'): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = kind === 'review_terminal' ? 32 : kind === 'tool_cabinet' || kind === 'parts_shelf' ? 32 : kind === 'window_panel' ? 32 : 48;
  canvas.height = kind === 'review_terminal' ? 32 : kind === 'tool_cabinet' || kind === 'parts_shelf' ? 32 : kind === 'plaza_planter' ? 40 : 24;
  const ctx = canvas.getContext('2d');
  if (!ctx) return pixelTextureFromCanvas(canvas);
  ctx.imageSmoothingEnabled = false;

  if (kind === 'garden_bed') {
    ctx.fillStyle = '#3b2b1f';
    ctx.fillRect(0, 10, 48, 14);
    ctx.fillStyle = '#7b4f2d';
    ctx.fillRect(2, 11, 44, 11);
    ctx.fillStyle = '#2f7d4d';
    for (let x = 4; x < 46; x += 5) ctx.fillRect(x, 4 + ((x / 5) % 3), 3, 8);
    ctx.fillStyle = '#8fce62';
    for (let x = 6; x < 44; x += 9) ctx.fillRect(x, 5, 2, 3);
    return pixelTextureFromCanvas(canvas);
  }

  if (kind === 'plaza_planter') {
    ctx.fillStyle = '#2a211d';
    ctx.fillRect(4, 20, 40, 12);
    ctx.fillStyle = '#73533a';
    ctx.fillRect(6, 22, 36, 8);
    ctx.fillStyle = '#2f6f4a';
    for (let x = 8; x <= 38; x += 5) ctx.fillRect(x, 10 + ((x / 5) % 3), 4, 12);
    ctx.fillStyle = '#88bf68';
    for (let x = 11; x <= 36; x += 8) ctx.fillRect(x, 9, 3, 5);
    ctx.fillStyle = '#d8b05f';
    ctx.fillRect(19, 15, 2, 3);
    ctx.fillRect(30, 13, 2, 3);
    ctx.fillStyle = '#1e1816';
    ctx.fillRect(7, 31, 34, 3);
    return pixelTextureFromCanvas(canvas);
  }

  if (kind === 'window_panel') {
    ctx.fillStyle = '#485456';
    ctx.fillRect(2, 4, 28, 18);
    ctx.fillStyle = '#8db0b6';
    ctx.fillRect(4, 6, 10, 13);
    ctx.fillRect(18, 6, 8, 13);
    ctx.fillStyle = '#d6e3df';
    ctx.fillRect(5, 7, 8, 2);
    ctx.fillRect(19, 7, 6, 2);
    ctx.fillStyle = '#6f7f80';
    ctx.fillRect(15, 5, 2, 16);
    ctx.fillRect(4, 20, 24, 2);
    return pixelTextureFromCanvas(canvas);
  }

  if (kind === 'wall_panel') {
    ctx.fillStyle = '#50433a';
    ctx.fillRect(3, 4, 42, 18);
    ctx.fillStyle = '#d0b46b';
    ctx.fillRect(5, 6, 38, 14);
    ctx.fillStyle = '#6f563a';
    for (let x = 8; x < 40; x += 8) ctx.fillRect(x, 8, 2, 9);
    ctx.fillStyle = '#2e5e4f';
    ctx.fillRect(10, 9, 5, 3);
    ctx.fillRect(24, 9, 9, 3);
    ctx.fillStyle = '#b85d42';
    ctx.fillRect(17, 14, 6, 3);
    return pixelTextureFromCanvas(canvas);
  }

  if (kind === 'door_frame') {
    ctx.fillStyle = '#4e4038';
    ctx.fillRect(6, 2, 36, 22);
    ctx.fillStyle = '#88725b';
    ctx.fillRect(10, 5, 28, 19);
    ctx.fillStyle = '#2e2c2b';
    ctx.fillRect(13, 8, 22, 16);
    ctx.fillStyle = '#d0b46b';
    ctx.fillRect(35, 15, 2, 2);
    return pixelTextureFromCanvas(canvas);
  }

  if (kind === 'maker_bench') {
    ctx.fillStyle = '#241d1a';
    ctx.fillRect(3, 8, 42, 14);
    ctx.fillStyle = '#9a673e';
    ctx.fillRect(5, 9, 38, 7);
    ctx.fillStyle = '#5b3e2d';
    ctx.fillRect(5, 17, 38, 3);
    ctx.fillStyle = '#7aa2aa';
    ctx.fillRect(10, 5, 9, 4);
    ctx.fillStyle = '#c49a4b';
    ctx.fillRect(25, 6, 10, 3);
    ctx.fillStyle = '#241d1a';
    ctx.fillRect(8, 21, 4, 3);
    ctx.fillRect(36, 21, 4, 3);
    return pixelTextureFromCanvas(canvas);
  }

  if (kind === 'tool_cabinet') {
    ctx.fillStyle = '#1f2933';
    ctx.fillRect(3, 6, 26, 22);
    ctx.fillStyle = '#b95f3b';
    ctx.fillRect(5, 8, 22, 18);
    ctx.fillStyle = '#e0a45d';
    for (let y = 11; y <= 21; y += 5) ctx.fillRect(7, y, 18, 1);
    ctx.fillStyle = '#f2d38a';
    ctx.fillRect(21, 10, 3, 2);
    ctx.fillRect(21, 15, 3, 2);
    ctx.fillRect(21, 20, 3, 2);
    ctx.fillStyle = '#0f1720';
    ctx.fillRect(5, 26, 22, 2);
    return pixelTextureFromCanvas(canvas);
  }

  if (kind === 'parts_shelf') {
    ctx.fillStyle = '#1c2730';
    ctx.fillRect(2, 4, 28, 24);
    ctx.fillStyle = '#5b4a36';
    ctx.fillRect(4, 6, 24, 20);
    ctx.fillStyle = '#2c3e4a';
    for (let y = 10; y <= 22; y += 6) ctx.fillRect(4, y, 24, 2);
    ctx.fillStyle = '#d9a441';
    ctx.fillRect(7, 7, 5, 3);
    ctx.fillStyle = '#7fb069';
    ctx.fillRect(14, 13, 5, 3);
    ctx.fillStyle = '#8ecae6';
    ctx.fillRect(21, 19, 5, 3);
    return pixelTextureFromCanvas(canvas);
  }

  if (kind === 'cable_spool') {
    ctx.fillStyle = '#172029';
    ctx.fillRect(11, 5, 26, 16);
    ctx.fillStyle = '#8f5e32';
    ctx.fillRect(8, 6, 6, 14);
    ctx.fillRect(34, 6, 6, 14);
    ctx.fillStyle = '#263746';
    for (let x = 15; x < 34; x += 3) ctx.fillRect(x, 8, 2, 10);
    ctx.fillStyle = '#6ec6df';
    ctx.fillRect(17, 10, 14, 2);
    return pixelTextureFromCanvas(canvas);
  }

  if (kind === 'hazard_barrel') {
    ctx.fillStyle = '#171b20';
    ctx.fillRect(15, 4, 18, 18);
    ctx.fillStyle = '#d8912d';
    ctx.fillRect(16, 5, 16, 16);
    ctx.fillStyle = '#1d242b';
    ctx.fillRect(16, 9, 16, 2);
    ctx.fillRect(16, 15, 16, 2);
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(19, 6, 4, 3);
    return pixelTextureFromCanvas(canvas);
  }

  const frame = kind === 'review_terminal' ? '#34465f' : '#5a3b24';
  const face = kind === 'status_wall' ? '#14372f' : kind === 'queue_board' ? '#1f2b45' : '#0b1826';
  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = face;
  ctx.fillRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fillStyle = kind === 'status_wall' ? '#54d48a' : '#ffd166';
  const rows = kind === 'review_terminal' ? 3 : 4;
  for (let i = 0; i < rows; i++) {
    const y = 5 + i * 5;
    ctx.fillRect(5, y, Math.max(5, canvas.width - 12 - i * 4), 2);
  }
  if (kind === 'queue_board') {
    ctx.fillStyle = '#ef476f';
    ctx.fillRect(canvas.width - 8, 5, 3, 3);
    ctx.fillStyle = '#06d6a0';
    ctx.fillRect(canvas.width - 8, 11, 3, 3);
  } else if (kind === 'status_wall') {
    ctx.fillStyle = '#8ecae6';
    ctx.fillRect(canvas.width - 11, canvas.height - 8, 6, 3);
  } else {
    ctx.fillStyle = '#8ecae6';
    ctx.fillRect(6, canvas.height - 7, canvas.width - 12, 2);
    ctx.fillStyle = '#ffb703';
    ctx.fillRect(8, 8, 3, 3);
  }
  return pixelTextureFromCanvas(canvas);
}

export interface ThreeSpriteManager {
  /** Per character palette: source image (or null) for UV-based sheet animation. */
  characterImages: (HTMLImageElement | null)[];
  /** Per character palette: full-sheet texture (clones share UV offsets per mesh). */
  characterSheetSrc: (HTMLImageElement | null)[];

  // Furniture textures
  furniture: {
    deskFront: THREE.Texture | null;
    deskSide: THREE.Texture | null;
    pcFront: THREE.Texture | null;
    pcFrontOn: (THREE.Texture | null)[];
    pcBack: THREE.Texture | null;
    pcSide: THREE.Texture | null;
    chairFront: THREE.Texture | null;
    chairBack: THREE.Texture | null;
    chairSide: THREE.Texture | null;
    tableFront: THREE.Texture | null;
    whiteboard: THREE.Texture | null;
    bookshelf: THREE.Texture | null;
    doubleBookshelf: THREE.Texture | null;
    plant: THREE.Texture | null;
    largePlant: THREE.Texture | null;
    hangingPlant: THREE.Texture | null;
    cactus: THREE.Texture | null;
    sofaFront: THREE.Texture | null;
    sofaBack: THREE.Texture | null;
    sofaSide: THREE.Texture | null;
    coffeeTable: THREE.Texture | null;
    coffee: THREE.Texture | null;
    bin: THREE.Texture | null;
    cushionedBench: THREE.Texture | null;
    smallTableFront: THREE.Texture | null;
    smallTableSide: THREE.Texture | null;
    clock: THREE.Texture | null;
    smallPainting: THREE.Texture | null;
    largePainting: THREE.Texture | null;
    queueBoard: THREE.Texture | null;
    statusWall: THREE.Texture | null;
    reviewTerminal: THREE.Texture | null;
    windowPanel: THREE.Texture | null;
    wallPanel: THREE.Texture | null;
    doorFrame: THREE.Texture | null;
    makerBench: THREE.Texture | null;
    plazaPlanter: THREE.Texture | null;
    gardenBed: THREE.Texture | null;
    toolCabinet: THREE.Texture | null;
    partsShelf: THREE.Texture | null;
    cableSpool: THREE.Texture | null;
    hazardBarrel: THREE.Texture | null;
  };
  floor: (HTMLImageElement | null)[];
  wall: HTMLImageElement | null;
  /** Frame size for character sprites in pixels (always 16/32 for this set). */
  charFrameW: number;
  charFrameH: number;
}

export async function loadThreeSprites(): Promise<ThreeSpriteManager> {
  const charPromises: Promise<HTMLImageElement | null>[] = [];
  for (let i = 0; i < CHAR_PALETTE_COUNT; i++) {
    charPromises.push(loadImageOptional(assetUrl(`/assets/characters/char_${i}.png`)));
  }
  const floorPromises: Promise<HTMLImageElement | null>[] = [];
  for (let i = 0; i < FLOOR_VARIANT_COUNT; i++) {
    floorPromises.push(loadImageOptional(assetUrl(`/assets/floors/floor_${i}.png`)));
  }
  const furniturePaths: Record<string, string> = {
    deskFront: '/assets/furniture/DESK/DESK_FRONT.png',
    deskSide: '/assets/furniture/DESK/DESK_SIDE.png',
    pcFront: '/assets/furniture/PC/PC_FRONT_OFF.png',
    pcFrontOn1: '/assets/furniture/PC/PC_FRONT_ON_1.png',
    pcFrontOn2: '/assets/furniture/PC/PC_FRONT_ON_2.png',
    pcFrontOn3: '/assets/furniture/PC/PC_FRONT_ON_3.png',
    pcBack: '/assets/furniture/PC/PC_BACK.png',
    pcSide: '/assets/furniture/PC/PC_SIDE.png',
    chairFront: '/assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png',
    chairBack: '/assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_BACK.png',
    chairSide: '/assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_SIDE.png',
    tableFront: '/assets/furniture/TABLE_FRONT/TABLE_FRONT.png',
    whiteboard: '/assets/furniture/WHITEBOARD/WHITEBOARD.png',
    bookshelf: '/assets/furniture/BOOKSHELF/BOOKSHELF.png',
    doubleBookshelf: '/assets/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png',
    plant: '/assets/furniture/PLANT/PLANT.png',
    largePlant: '/assets/furniture/LARGE_PLANT/LARGE_PLANT.png',
    hangingPlant: '/assets/furniture/HANGING_PLANT/HANGING_PLANT.png',
    cactus: '/assets/furniture/CACTUS/CACTUS.png',
    sofaFront: '/assets/furniture/SOFA/SOFA_FRONT.png',
    sofaBack: '/assets/furniture/SOFA/SOFA_BACK.png',
    sofaSide: '/assets/furniture/SOFA/SOFA_SIDE.png',
    coffeeTable: '/assets/furniture/COFFEE_TABLE/COFFEE_TABLE.png',
    coffee: '/assets/furniture/COFFEE/COFFEE.png',
    bin: '/assets/furniture/BIN/BIN.png',
    cushionedBench: '/assets/furniture/CUSHIONED_BENCH/CUSHIONED_BENCH.png',
    smallTableFront: '/assets/furniture/SMALL_TABLE/SMALL_TABLE_FRONT.png',
    smallTableSide: '/assets/furniture/SMALL_TABLE/SMALL_TABLE_SIDE.png',
    clock: '/assets/furniture/CLOCK/CLOCK.png',
    smallPainting: '/assets/furniture/SMALL_PAINTING/SMALL_PAINTING.png',
    largePainting: '/assets/furniture/LARGE_PAINTING/LARGE_PAINTING.png',
  };
  const wallPromise = loadImageOptional(assetUrl('/assets/walls/wall_0.png'));
  const furnPromises = Object.values(furniturePaths).map((path) => loadImageOptional(assetUrl(path)));
  const furnKeys = Object.keys(furniturePaths);

  const [wallImg, charImgs, floorImgs, furnImgs] = await Promise.all([
    wallPromise,
    Promise.all(charPromises),
    Promise.all(floorPromises),
    Promise.all(furnPromises),
  ]);

  const furniture: ThreeSpriteManager['furniture'] = {} as ThreeSpriteManager['furniture'];
  const pcFrontOn: (THREE.Texture | null)[] = [];
  for (let i = 0; i < furnKeys.length; i++) {
    const key = furnKeys[i];
    const texture = pixelTextureFromImage(furnImgs[i]);
    if (key === 'pcFrontOn1' || key === 'pcFrontOn2' || key === 'pcFrontOn3') {
      pcFrontOn.push(texture);
      continue;
    }
    (furniture as Record<string, THREE.Texture | null | (THREE.Texture | null)[]>)[key] = texture;
  }
  furniture.pcFrontOn = pcFrontOn;
  furniture.queueBoard = makeGatherPropTexture('queue_board');
  furniture.statusWall = makeGatherPropTexture('status_wall');
  furniture.reviewTerminal = makeGatherPropTexture('review_terminal');
  furniture.windowPanel = makeGatherPropTexture('window_panel');
  furniture.wallPanel = makeGatherPropTexture('wall_panel');
  furniture.doorFrame = makeGatherPropTexture('door_frame');
  furniture.makerBench = makeGatherPropTexture('maker_bench');
  furniture.plazaPlanter = makeGatherPropTexture('plaza_planter');
  furniture.gardenBed = makeGatherPropTexture('garden_bed');
  furniture.toolCabinet = makeGatherPropTexture('tool_cabinet');
  furniture.partsShelf = makeGatherPropTexture('parts_shelf');
  furniture.cableSpool = makeGatherPropTexture('cable_spool');
  furniture.hazardBarrel = makeGatherPropTexture('hazard_barrel');

  return {
    characterImages: charImgs,
    characterSheetSrc: charImgs,
    furniture,
    floor: floorImgs,
    wall: wallImg,
    charFrameW: CHAR_FRAME_W,
    charFrameH: CHAR_FRAME_H,
  };
}

/** Build a CanvasTexture from a sub-rectangle of an image — used to slice
 *  individual character frames out of the 7×3 sheet. Returns null on failure. */
export function makeCharFrameTexture(
  src: HTMLImageElement | null,
  fx: number,
  fy: number,
  fw: number,
  fh: number,
  flipX = false,
): THREE.CanvasTexture | null {
  if (!src) return null;
  const c = document.createElement('canvas');
  c.width = fw;
  c.height = fh;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  if (flipX) {
    ctx.translate(fw, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, fx, fy, fw, fh, 0, 0, fw, fh);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = false;
  tex.needsUpdate = true;
  return tex;
}

/** Build a per-palette character-frame matrix: [direction][frame] → texture.
 *  Direction order: DOWN=0, LEFT=1 (mirrored), RIGHT=2, UP=3 (matches engine). */
export function buildCharacterTextureSheet(
  src: HTMLImageElement | null,
): THREE.Texture[][] | null {
  if (!src) return null;
  const dirs: THREE.Texture[][] = [[], [], [], []];
  for (let f = 0; f < CHAR_FRAMES_PER_DIR; f++) {
    const sx = f * CHAR_FRAME_W;
    const down = makeCharFrameTexture(src, sx, 0, CHAR_FRAME_W, CHAR_FRAME_H);
    const up = makeCharFrameTexture(src, sx, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H);
    const right = makeCharFrameTexture(src, sx, CHAR_FRAME_H * 2, CHAR_FRAME_W, CHAR_FRAME_H);
    const left = makeCharFrameTexture(src, sx, CHAR_FRAME_H * 2, CHAR_FRAME_W, CHAR_FRAME_H, true);
    if (down) dirs[0][f] = down;
    if (left) dirs[1][f] = left;
    if (right) dirs[2][f] = right;
    if (up) dirs[3][f] = up;
  }
  return dirs;
}
