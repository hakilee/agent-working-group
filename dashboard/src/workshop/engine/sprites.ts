import {
  Direction,
  type SpriteManager,
  type SpriteSheet,
} from './types';

const CHAR_FRAME_W = 16;
const CHAR_FRAME_H = 32;
const CHAR_FRAMES_PER_DIR = 7;
const CHAR_PALETTE_COUNT = 6;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image ${src}`));
    img.src = src;
  });
}

function loadImageOptional(src: string): Promise<HTMLImageElement | null> {
  return loadImage(src).catch(() => null);
}

function flipHorizontal(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return out;
}

function sliceFrame(
  src: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}

/**
 * Build a CharacterSpriteSheet from a char_N.png.
 * Source layout: 7 frames wide × 3 directions tall (down, up, right).
 * byDirFrame[dir][frame] returns a 16×32 canvas. Direction.LEFT is built by flipping RIGHT.
 */
function buildCharacterSheet(img: HTMLImageElement): SpriteSheet {
  const dirs: HTMLCanvasElement[][] = [[], [], [], []];
  for (let f = 0; f < CHAR_FRAMES_PER_DIR; f++) {
    const sx = f * CHAR_FRAME_W;
    const downFrame = sliceFrame(img, sx, 0, CHAR_FRAME_W, CHAR_FRAME_H);
    const upFrame = sliceFrame(img, sx, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H);
    const rightFrame = sliceFrame(img, sx, CHAR_FRAME_H * 2, CHAR_FRAME_W, CHAR_FRAME_H);
    const leftFrame = flipHorizontal(rightFrame);
    dirs[Direction.DOWN][f] = downFrame;
    dirs[Direction.UP][f] = upFrame;
    dirs[Direction.RIGHT][f] = rightFrame;
    dirs[Direction.LEFT][f] = leftFrame;
  }
  return { byDirFrame: dirs };
}

export async function loadSprites(): Promise<SpriteManager> {
  const charPromises: Promise<HTMLImageElement | null>[] = [];
  for (let i = 0; i < CHAR_PALETTE_COUNT; i++) {
    charPromises.push(loadImageOptional(`/assets/characters/char_${i}.png`));
  }
  const [
    floor,
    wall,
    deskFront,
    deskSide,
    pcFront,
    pcBack,
    pcSide,
    chairFront,
    chairBack,
    chairSide,
    tableFront,
    whiteboard,
    bookshelf,
    doubleBookshelf,
    plant,
    largePlant,
    hangingPlant,
    cactus,
    sofaFront,
    sofaBack,
    sofaSide,
    coffeeTable,
    cushionedBench,
    smallTableFront,
    smallTableSide,
    clock,
    smallPainting,
    largePainting,
    ...chars
  ] = await Promise.all([
    loadImageOptional('/assets/floors/floor_0.png'),
    loadImageOptional('/assets/walls/wall_0.png'),
    loadImageOptional('/assets/furniture/DESK/DESK_FRONT.png'),
    loadImageOptional('/assets/furniture/DESK/DESK_SIDE.png'),
    loadImageOptional('/assets/furniture/PC/PC_FRONT_OFF.png'),
    loadImageOptional('/assets/furniture/PC/PC_BACK.png'),
    loadImageOptional('/assets/furniture/PC/PC_SIDE.png'),
    loadImageOptional('/assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png'),
    loadImageOptional('/assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_BACK.png'),
    loadImageOptional('/assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_SIDE.png'),
    loadImageOptional('/assets/furniture/TABLE_FRONT/TABLE_FRONT.png'),
    loadImageOptional('/assets/furniture/WHITEBOARD/WHITEBOARD.png'),
    loadImageOptional('/assets/furniture/BOOKSHELF/BOOKSHELF.png'),
    loadImageOptional('/assets/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png'),
    loadImageOptional('/assets/furniture/PLANT/PLANT.png'),
    loadImageOptional('/assets/furniture/LARGE_PLANT/LARGE_PLANT.png'),
    loadImageOptional('/assets/furniture/HANGING_PLANT/HANGING_PLANT.png'),
    loadImageOptional('/assets/furniture/CACTUS/CACTUS.png'),
    loadImageOptional('/assets/furniture/SOFA/SOFA_FRONT.png'),
    loadImageOptional('/assets/furniture/SOFA/SOFA_BACK.png'),
    loadImageOptional('/assets/furniture/SOFA/SOFA_SIDE.png'),
    loadImageOptional('/assets/furniture/COFFEE_TABLE/COFFEE_TABLE.png'),
    loadImageOptional('/assets/furniture/CUSHIONED_BENCH/CUSHIONED_BENCH.png'),
    loadImageOptional('/assets/furniture/SMALL_TABLE/SMALL_TABLE_FRONT.png'),
    loadImageOptional('/assets/furniture/SMALL_TABLE/SMALL_TABLE_SIDE.png'),
    loadImageOptional('/assets/furniture/CLOCK/CLOCK.png'),
    loadImageOptional('/assets/furniture/SMALL_PAINTING/SMALL_PAINTING.png'),
    loadImageOptional('/assets/furniture/LARGE_PAINTING/LARGE_PAINTING.png'),
    ...charPromises,
  ]);

  const sheets: SpriteSheet[] = [];
  for (const img of chars) {
    if (img) sheets.push(buildCharacterSheet(img));
  }

  return {
    characters: sheets,
    furniture: {
      desk: { front: deskFront, side: deskSide },
      pc: { front: pcFront, back: pcBack, side: pcSide },
      chair: { front: chairFront, back: chairBack, side: chairSide },
      table: { front: tableFront },
      whiteboard,
      bookshelf,
      doubleBookshelf,
      plant,
      largePlant,
      hangingPlant,
      cactus,
      sofa: { front: sofaFront, back: sofaBack, side: sofaSide },
      coffeeTable,
      cushionedBench,
      smallTable: { front: smallTableFront, side: smallTableSide },
      clock,
      smallPainting,
      largePainting,
    },
    floor,
    wall,
    charFrameW: CHAR_FRAME_W,
    charFrameH: CHAR_FRAME_H,
  };
}

/** Walk loop maps logical frame [0..3] → sprite index in [0,1,2,1]. */
export const WALK_FRAME_ORDER: ReadonlyArray<number> = [0, 1, 2, 1];

/** Resolve the sprite frame index given character state and frame counter. */
export function spriteFrameIndex(
  state: 'idle' | 'walk' | 'type' | 'read',
  frame: number,
): number {
  if (state === 'walk') return WALK_FRAME_ORDER[frame % WALK_FRAME_ORDER.length];
  if (state === 'type') return 3 + (frame % 2);
  if (state === 'read') return 5 + (frame % 2);
  return 0;
}
