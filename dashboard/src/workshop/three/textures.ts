import * as THREE from 'three';

/** Frame W/H for a single character sprite within the 7×3 sheet. */
export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 32;
/** 7 frames wide × 3 directions tall (down/up/right). LEFT is RIGHT flipped. */
export const CHAR_FRAMES_PER_DIR = 7;
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
    charPromises.push(loadImageOptional(`/assets/characters/char_${i}.png`));
  }
  const floorPromises: Promise<HTMLImageElement | null>[] = [];
  for (let i = 0; i < FLOOR_VARIANT_COUNT; i++) {
    floorPromises.push(loadImageOptional(`/assets/floors/floor_${i}.png`));
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
  const wallPromise = loadImageOptional('/assets/walls/wall_0.png');
  const furnPromises = Object.values(furniturePaths).map(loadImageOptional);
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
