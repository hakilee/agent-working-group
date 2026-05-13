import {
  Direction,
  TileType,
  type FurnitureInstance,
  type OfficeLayout,
  type Seat,
} from './types';

const COLS = 30;
const ROWS = 20;

/** Spacing for desks: each desk takes 3 cols + 1 gap = 4 cols. */
const DESK_WIDTH = 3;
const DESK_GAP = 1;
const DESK_STRIDE = DESK_WIDTH + DESK_GAP; // 4

/** Top-row desks. */
const TOP_DESK_ROW = 3;
const TOP_DESK_FRONT_ROW = 4;
const TOP_CHAIR_ROW = 5;
const TOP_DESK_START_COL = 2;

/** Bottom-row desks (used when more than 4 roles). */
const BOTTOM_DESK_ROW = 13;
const BOTTOM_DESK_FRONT_ROW = 14;
const BOTTOM_CHAIR_ROW = 12;
const BOTTOM_DESK_START_COL = 2;

/** Right-side desks for additional roles. */
const RIGHT_DESK_START_ROW = 3;
const RIGHT_DESK_STRIDE = 4;
const RIGHT_DESK_COL = 25;

const TOP_DESK_SLOTS = 4;
const BOTTOM_DESK_SLOTS = 4;
const RIGHT_DESK_SLOTS = 3;

/** Create an OfficeLayout with at least `minSeats` desk seats. */
export function createLayout(minSeats: number): OfficeLayout {
  const cols = COLS;
  const rows = ROWS;
  const tiles: TileType[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: TileType[] = [];
    for (let c = 0; c < cols; c++) {
      const onEdge = c === 0 || c === cols - 1 || r === 0 || r === rows - 1;
      row.push(onEdge ? TileType.WALL : TileType.FLOOR);
    }
    tiles.push(row);
  }

  const furniture: FurnitureInstance[] = [];
  const seats: Seat[] = [];
  const blocked = new Set<string>();

  const block = (col: number, row: number) => {
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      blocked.add(`${col},${row}`);
    }
  };

  let seatCounter = 0;
  const totalSeatsNeeded = Math.max(2, Math.min(minSeats, TOP_DESK_SLOTS + BOTTOM_DESK_SLOTS + RIGHT_DESK_SLOTS));

  const addTopDeskCluster = (leftCol: number) => {
    const seatId = seatCounter;
    furniture.push({
      id: `desk-${seatId}`,
      kind: 'desk',
      variant: 'front',
      col: leftCol,
      row: TOP_DESK_ROW,
      w: DESK_WIDTH,
      h: 2,
      blocking: true,
    });
    for (let dc = 0; dc < DESK_WIDTH; dc++) {
      block(leftCol + dc, TOP_DESK_ROW);
      block(leftCol + dc, TOP_DESK_FRONT_ROW);
    }
    furniture.push({
      id: `pc-${seatId}`,
      kind: 'pc',
      variant: 'back',
      col: leftCol + 1,
      row: TOP_DESK_ROW - 1,
      w: 1,
      h: 1,
      spriteOverhangRows: 1,
      blocking: false,
    });
    const chairCol = leftCol + 1;
    furniture.push({
      id: `chair-${seatId}`,
      kind: 'chair',
      variant: 'front',
      col: chairCol,
      row: TOP_CHAIR_ROW,
      w: 1,
      h: 1,
      spriteOverhangRows: 1,
      blocking: false,
    });
    seats.push({
      id: `seat-${seatId}`,
      col: chairCol,
      row: TOP_CHAIR_ROW,
      facingDir: Direction.UP,
      assignedRole: null,
      kind: 'desk',
    });
    seatCounter += 1;
  };

  const addBottomDeskCluster = (leftCol: number) => {
    const seatId = seatCounter;
    furniture.push({
      id: `desk-${seatId}`, kind: 'desk', variant: 'front',
      col: leftCol, row: BOTTOM_DESK_ROW, w: DESK_WIDTH, h: 2, blocking: true,
    });
    for (let dc = 0; dc < DESK_WIDTH; dc++) {
      block(leftCol + dc, BOTTOM_DESK_ROW);
      block(leftCol + dc, BOTTOM_DESK_FRONT_ROW);
    }
    furniture.push({
      id: `pc-${seatId}`, kind: 'pc', variant: 'front',
      col: leftCol + 1, row: BOTTOM_DESK_ROW - 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
    });
    const chairCol = leftCol + 1;
    furniture.push({
      id: `chair-${seatId}`, kind: 'chair', variant: 'back',
      col: chairCol, row: BOTTOM_CHAIR_ROW, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
    });
    seats.push({
      id: `seat-${seatId}`, col: chairCol, row: BOTTOM_CHAIR_ROW,
      facingDir: Direction.DOWN, assignedRole: null, kind: 'desk',
    });
    seatCounter += 1;
  };

  const addRightDeskCluster = (topRow: number) => {
    const seatId = seatCounter;
    const leftCol = RIGHT_DESK_COL;
    furniture.push({
      id: `desk-${seatId}`, kind: 'desk', variant: 'side',
      col: leftCol, row: topRow, w: 1, h: DESK_WIDTH, blocking: true,
    });
    for (let dr = 0; dr < DESK_WIDTH; dr++) block(leftCol, topRow + dr);
    furniture.push({
      id: `pc-${seatId}`, kind: 'pc', variant: 'side',
      col: leftCol, row: topRow + 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
    });
    const chairRow = topRow + 1;
    const chairCol = leftCol - 1;
    furniture.push({
      id: `chair-${seatId}`, kind: 'chair', variant: 'side',
      col: chairCol, row: chairRow, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
    });
    seats.push({
      id: `seat-${seatId}`, col: chairCol, row: chairRow,
      facingDir: Direction.RIGHT, assignedRole: null, kind: 'desk',
    });
    seatCounter += 1;
  };

  // Top row of desks.
  const topCount = Math.min(totalSeatsNeeded, TOP_DESK_SLOTS);
  for (let i = 0; i < topCount; i++) {
    addTopDeskCluster(TOP_DESK_START_COL + i * DESK_STRIDE);
  }

  // Bottom row of desks.
  const remaining = totalSeatsNeeded - topCount;
  const bottomCount = Math.min(remaining, BOTTOM_DESK_SLOTS);
  for (let i = 0; i < bottomCount; i++) {
    addBottomDeskCluster(BOTTOM_DESK_START_COL + i * DESK_STRIDE);
  }

  // Right-side desks for additional roles.
  const rightRemaining = remaining - bottomCount;
  const rightCount = Math.min(rightRemaining, RIGHT_DESK_SLOTS);
  for (let i = 0; i < rightCount; i++) {
    addRightDeskCluster(RIGHT_DESK_START_ROW + i * RIGHT_DESK_STRIDE);
  }

  // ─── Central meeting table (3×1) ───
  const tableCol = 13;
  const tableRow = 9;
  furniture.push({
    id: 'table-0', kind: 'table', variant: 'front',
    col: tableCol, row: tableRow, w: 3, h: 1, blocking: true,
  });
  for (let dc = 0; dc < 3; dc++) block(tableCol + dc, tableRow);

  // ─── Whiteboard mounted on the top wall (centered above meeting) ───
  furniture.push({
    id: 'whiteboard-0', kind: 'whiteboard', variant: 'front',
    col: 13, row: 1, w: 2, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  block(13, 1); block(14, 1);

  // ─── Clock on top wall ───
  furniture.push({
    id: 'clock-0', kind: 'clock', variant: 'front',
    col: 10, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  block(10, 1);

  // ─── Wall paintings ───
  furniture.push({
    id: 'painting-small-0', kind: 'small_painting', variant: 'front',
    col: 6, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  block(6, 1);
  furniture.push({
    id: 'painting-small-1', kind: 'small_painting', variant: 'front',
    col: 18, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  block(18, 1);
  furniture.push({
    id: 'painting-large-0', kind: 'large_painting', variant: 'front',
    col: 20, row: 1, w: 2, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  block(20, 1); block(21, 1);

  // ─── Bookshelves: along right wall (interior column 27-28) ───
  furniture.push({
    id: 'bookshelf-top', kind: 'bookshelf', variant: 'front',
    col: 27, row: 2, w: 2, h: 1, blocking: true,
  });
  block(27, 2); block(28, 2);
  furniture.push({
    id: 'double-bookshelf-0', kind: 'double_bookshelf', variant: 'front',
    col: 27, row: 7, w: 2, h: 2, blocking: true,
  });
  block(27, 7); block(28, 7); block(27, 8); block(28, 8);

  // ─── Hanging plants on top wall area ───
  furniture.push({
    id: 'hanging-plant-0', kind: 'hanging_plant', variant: 'front',
    col: 2, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
  });
  furniture.push({
    id: 'hanging-plant-1', kind: 'hanging_plant', variant: 'front',
    col: 24, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
  });

  // ─── Lounge area in bottom corner ───
  furniture.push({
    id: 'sofa-front-0', kind: 'sofa', variant: 'front',
    col: 20, row: 16, w: 2, h: 1, blocking: true,
  });
  block(20, 16); block(21, 16);
  furniture.push({
    id: 'sofa-side-0', kind: 'sofa', variant: 'side',
    col: 19, row: 16, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  block(19, 16);
  furniture.push({
    id: 'sofa-side-1', kind: 'sofa', variant: 'side-mirror',
    col: 22, row: 16, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  block(22, 16);
  furniture.push({
    id: 'coffee-table-0', kind: 'coffee_table', variant: 'front',
    col: 20, row: 18, w: 2, h: 1, blocking: true,
  });
  block(20, 18); block(21, 18);

  // ─── Reading nook ───
  furniture.push({
    id: 'small-table-0', kind: 'small_table', variant: 'front',
    col: 8, row: 17, w: 2, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  block(8, 17); block(9, 17);
  furniture.push({
    id: 'cushioned-bench-0', kind: 'cushioned_bench', variant: 'front',
    col: 7, row: 17, w: 1, h: 1, blocking: true,
  });
  block(7, 17);
  furniture.push({
    id: 'cushioned-bench-1', kind: 'cushioned_bench', variant: 'front',
    col: 10, row: 17, w: 1, h: 1, blocking: true,
  });
  block(10, 17);

  // ─── Plants and greenery throughout ───
  furniture.push({
    id: 'large-plant-0', kind: 'large_plant', variant: 'front',
    col: 1, row: 17, w: 2, h: 2, spriteOverhangRows: 1, blocking: true,
  });
  block(1, 17); block(2, 17); block(1, 18); block(2, 18);
  furniture.push({
    id: 'large-plant-1', kind: 'large_plant', variant: 'front',
    col: 27, row: 17, w: 2, h: 2, spriteOverhangRows: 1, blocking: true,
  });
  block(27, 17); block(28, 17); block(27, 18); block(28, 18);

  furniture.push({
    id: 'plant-0', kind: 'plant', variant: 'front',
    col: 1, row: 7, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
  });
  furniture.push({
    id: 'plant-1', kind: 'plant', variant: 'front',
    col: 1, row: 11, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
  });
  furniture.push({
    id: 'plant-2', kind: 'plant', variant: 'front',
    col: 17, row: 10, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
  });

  furniture.push({
    id: 'cactus-0', kind: 'cactus', variant: 'front',
    col: 5, row: 9, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
  });
  furniture.push({
    id: 'cactus-1', kind: 'cactus', variant: 'front',
    col: 18, row: 7, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
  });

  return { cols, rows, tiles, furniture, seats, blocked };
}

export interface MeetingSpot {
  col: number;
  row: number;
}

/** Returns a tile adjacent to the meeting table where an agent can stand. */
export function meetingSpotFor(layout: OfficeLayout, index: number): MeetingSpot {
  // Standing spots around table (3x1 at (13,9)): tiles to north/south.
  const spots: MeetingSpot[] = [
    { col: 13, row: 10 },
    { col: 14, row: 10 },
    { col: 15, row: 10 },
    { col: 13, row: 8 },
    { col: 14, row: 8 },
    { col: 15, row: 8 },
    { col: 12, row: 9 },
    { col: 16, row: 9 },
  ];
  const ok = spots.filter(
    (s) =>
      s.col > 0 &&
      s.col < layout.cols - 1 &&
      s.row > 0 &&
      s.row < layout.rows - 1 &&
      !layout.blocked.has(`${s.col},${s.row}`) &&
      layout.tiles[s.row][s.col] !== TileType.WALL,
  );
  if (ok.length === 0) return { col: Math.floor(layout.cols / 2), row: Math.floor(layout.rows / 2) };
  return ok[index % ok.length];
}

/** Returns a deterministic walkable wander target across the expanded floor. */
export function wanderSpotFor(layout: OfficeLayout, seed: number): { col: number; row: number } {
  const candidates: Array<{ col: number; row: number }> = [];
  // Broad wandering region: central walkways between desk rows and the lounge zone.
  for (let r = 6; r <= 15; r++) {
    for (let c = 2; c <= layout.cols - 3; c++) {
      if (
        !layout.blocked.has(`${c},${r}`) &&
        layout.tiles[r][c] === TileType.FLOOR
      ) {
        candidates.push({ col: c, row: r });
      }
    }
  }
  if (candidates.length === 0) return { col: Math.floor(layout.cols / 2), row: Math.floor(layout.rows / 2) };
  const idx = Math.abs(seed) % candidates.length;
  return candidates[idx];
}

export const LAYOUT_TILE_COLS = COLS;
export const LAYOUT_TILE_ROWS = ROWS;
