import {
  Direction,
  TileType,
  type FurnitureInstance,
  type OfficeLayout,
  type Seat,
} from './types';

const COLS = 20;
const ROWS = 14;

/** Spacing for desks along the top wall: each desk takes 3 cols + 1 gap = 4 cols. */
const DESK_WIDTH = 3;
const DESK_GAP = 1;
const DESK_STRIDE = DESK_WIDTH + DESK_GAP; // 4

/** Top-row desks: top-left col, desk row span, chair row. */
const TOP_DESK_ROW = 2; // desk back row
const TOP_DESK_FRONT_ROW = 3; // desk front row
const TOP_CHAIR_ROW = 4; // chair tile (character seat tile)
const TOP_DESK_START_COL = 2; // leftmost desk's leftmost col

/** Bottom-row desks (used when more than 4 roles). */
const BOTTOM_DESK_ROW = 9;
const BOTTOM_DESK_FRONT_ROW = 10;
const BOTTOM_CHAIR_ROW = 11;
const BOTTOM_DESK_START_COL = 2;

const TOP_DESK_SLOTS = 4;
const BOTTOM_DESK_SLOTS = 4;

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
  const totalSeatsNeeded = Math.max(2, Math.min(minSeats, TOP_DESK_SLOTS + BOTTOM_DESK_SLOTS));

  const addDeskCluster = (
    leftCol: number,
    backRow: number,
    frontRow: number,
    chairRow: number,
    facing: 0 | 3, // Direction.DOWN | Direction.UP
  ) => {
    const deskId = `desk-${seatCounter}`;
    furniture.push({
      id: deskId,
      kind: 'desk',
      variant: 'front',
      col: leftCol,
      row: backRow,
      w: DESK_WIDTH,
      h: 2,
      blocking: true,
    });
    for (let dc = 0; dc < DESK_WIDTH; dc++) {
      block(leftCol + dc, backRow);
      block(leftCol + dc, frontRow);
    }
    // PC on top-center tile of desk (visually extends 1 tile above the desk).
    furniture.push({
      id: `pc-${seatCounter}`,
      kind: 'pc',
      variant: facing === Direction.UP ? 'front' : 'back',
      col: leftCol + 1,
      row: backRow - 1,
      w: 1,
      h: 1,
      spriteOverhangRows: 1,
      blocking: false,
    });
    // Chair tile (seat tile). Character stands here when sitting.
    const chairCol = leftCol + 1;
    furniture.push({
      id: `chair-${seatCounter}`,
      kind: 'chair',
      variant: facing === Direction.UP ? 'back' : 'front',
      col: chairCol,
      row: chairRow,
      w: 1,
      h: 1,
      spriteOverhangRows: 1,
      blocking: false,
    });
    seats.push({
      id: `seat-${seatCounter}`,
      col: chairCol,
      row: chairRow,
      facingDir: facing,
      assignedRole: null,
      kind: 'desk',
    });
    seatCounter += 1;
  };

  // Top row of desks (chair south of desk; character faces UP toward desk).
  const topCount = Math.min(totalSeatsNeeded, TOP_DESK_SLOTS);
  for (let i = 0; i < topCount; i++) {
    const leftCol = TOP_DESK_START_COL + i * DESK_STRIDE;
    addDeskCluster(leftCol, TOP_DESK_ROW, TOP_DESK_FRONT_ROW, TOP_CHAIR_ROW, Direction.UP);
  }

  // Bottom row of desks (chair north of desk; character faces DOWN toward desk).
  const remaining = totalSeatsNeeded - topCount;
  for (let i = 0; i < remaining && i < BOTTOM_DESK_SLOTS; i++) {
    const leftCol = BOTTOM_DESK_START_COL + i * DESK_STRIDE;
    // For bottom desks, we flip the layout: chair is north of desk (above).
    // chairRow is row 8, deskBack row is row 10, deskFront row is 9.
    // For simplicity we re-use addDeskCluster with facing DOWN; but our cluster
    // assumes desk is north of chair. So we manually place a bottom cluster here.
    const chairRow = BOTTOM_CHAIR_ROW - 3; // 8
    const deskBack = BOTTOM_DESK_FRONT_ROW; // 10 (front of desk near bottom wall)
    const deskFront = BOTTOM_DESK_ROW; // 9 (close to chair)
    const seatId = seatCounter;
    furniture.push({
      id: `desk-${seatId}`,
      kind: 'desk',
      variant: 'front',
      col: leftCol,
      row: deskFront,
      w: DESK_WIDTH,
      h: 2,
      blocking: true,
    });
    for (let dc = 0; dc < DESK_WIDTH; dc++) {
      block(leftCol + dc, deskFront);
      block(leftCol + dc, deskBack);
    }
    // Bottom-side desks face the camera (variant 'front' on the desk);
    // skipping a PC sprite here keeps the rendering simple and avoids
    // z-sort tangles with the chair sitting north of the desk.
    const chairCol = leftCol + 1;
    furniture.push({
      id: `chair-${seatId}`,
      kind: 'chair',
      variant: 'front',
      col: chairCol,
      row: chairRow,
      w: 1,
      h: 1,
      spriteOverhangRows: 1,
      blocking: false,
    });
    seats.push({
      id: `seat-${seatId}`,
      col: chairCol,
      row: chairRow,
      facingDir: Direction.DOWN,
      assignedRole: null,
      kind: 'desk',
    });
    seatCounter += 1;
  }

  // Central meeting table — 2 tiles wide, 1 tile tall.
  const tableCol = 9;
  const tableRow = 6;
  furniture.push({
    id: 'table-0',
    kind: 'table',
    variant: 'front',
    col: tableCol,
    row: tableRow,
    w: 2,
    h: 1,
    blocking: true,
  });
  block(tableCol, tableRow);
  block(tableCol + 1, tableRow);

  return { cols, rows, tiles, furniture, seats, blocked };
}

export interface MeetingSpot {
  col: number;
  row: number;
}

/** Returns a tile adjacent to the meeting table where an agent can stand. */
export function meetingSpotFor(layout: OfficeLayout, index: number): MeetingSpot {
  // Standing spots around table (2x1 at (9,6),(10,6)): tiles to north/south are walkable.
  const spots: MeetingSpot[] = [
    { col: 9, row: 7 },
    { col: 10, row: 7 },
    { col: 9, row: 5 },
    { col: 10, row: 5 },
    { col: 8, row: 6 },
    { col: 11, row: 6 },
  ];
  // Filter to walkable
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

/** Returns a deterministic walkable wander target. */
export function wanderSpotFor(layout: OfficeLayout, seed: number): { col: number; row: number } {
  // Sample candidate tiles in a band along the floor.
  const candidates: Array<{ col: number; row: number }> = [];
  for (let r = 5; r <= 8; r++) {
    for (let c = 2; c < layout.cols - 2; c++) {
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
