/**
 * Office layout — a multi-room pixel-art production office.
 *
 * The map is partitioned into six rooms (focus / meeting / ops / reception /
 * lounge / library), separated by interior walls with doorway openings.
 * Floors use per-room variants so each zone reads differently; furniture is
 * placed with believable spacing and pathfinding clearance.
 *
 * Seats are appended in role priority order: the focus room first (so `lead`
 * and `worker` land in the most prominent desks), then ops desks for any
 * additional agents, then the reception desk as the last fallback. Meeting
 * spots are dynamic (chosen at runtime) and do not consume desk seats.
 */
import {
  CharacterState,
  Direction,
  TileType,
  type FurnitureInstance,
  type OfficeActivityDestination,
  type OfficeLayout,
  type RoomZone,
  type Seat,
} from './types';

const COLS = 40;
const ROWS = 26;

/** Vertical interior walls separate the three columns of rooms. */
const INTERIOR_WALL_COLS: ReadonlySet<number> = new Set([14, 28]);
/** Horizontal interior wall separates top rooms from bottom rooms. */
const INTERIOR_WALL_ROW = 13;

/** Rows where the vertical interior walls have doorway openings (two doors
 *  per wall — one for the top row of rooms, one for the bottom). */
const VERT_DOOR_ROWS: ReadonlySet<number> = new Set([6, 7, 19, 20]);
/** Cols where the horizontal interior wall has doorway openings (three doors
 *  — one between each pair of vertically-stacked rooms). */
const HORIZ_DOOR_COLS: ReadonlySet<number> = new Set([6, 7, 20, 21, 33, 34]);

/** Floor variant assignments. Six rooms use distinct variants from the
 *  restored asset pack; missing variants still fall back to floor[0]. */
const ROOM_ZONES: ReadonlyArray<RoomZone> = [
  { id: 'focus',     label: 'Focus',     minCol:  1, maxCol: 13, minRow:  1, maxRow: 12, floorVariant: 1 },
  { id: 'meeting',   label: 'Meeting',   minCol: 15, maxCol: 27, minRow:  1, maxRow: 12, floorVariant: 2 },
  { id: 'ops',       label: 'Ops',       minCol: 29, maxCol: 38, minRow:  1, maxRow: 12, floorVariant: 3 },
  { id: 'reception', label: 'Reception', minCol:  1, maxCol: 13, minRow: 14, maxRow: 24, floorVariant: 0 },
  { id: 'lounge',    label: 'Lounge',    minCol: 15, maxCol: 27, minRow: 14, maxRow: 24, floorVariant: 4 },
  { id: 'library',   label: 'Library',   minCol: 29, maxCol: 38, minRow: 14, maxRow: 24, floorVariant: 5 },
];

const DESK_WIDTH = 3;

/** Top-row focus desks (chair south of desk, agent faces UP toward monitor).
 *  The desk has h=2, so its footprint covers rows DESK_ROW..DESK_ROW+1 and
 *  the chair sits one row further south. */
const FOCUS_TOP_DESK_ROW = 3;
const FOCUS_TOP_CHAIR_ROW = 5;
/** Bottom-row focus desks (chair north of desk, agent faces DOWN). */
const FOCUS_BOTTOM_DESK_ROW = 10;
const FOCUS_BOTTOM_CHAIR_ROW = 9;
/** Focus-room desk left-edge columns. Three desks per row, 4-col stride. */
const FOCUS_DESK_COLS = [2, 6, 10] as const;

/** Ops room: east-facing desks against the right wall. Each desk is a tall
 *  1-wide × 3-tall side-desk; the agent sits on its west side facing east. */
const OPS_DESK_COL = 37;
const OPS_DESK_TOP_ROWS = [2, 6, 10] as const;

interface Builder {
  cols: number;
  rows: number;
  tiles: TileType[][];
  floorVariants: number[][];
  furniture: FurnitureInstance[];
  seats: Seat[];
  blocked: Set<string>;
  seatCounter: number;
}

function isInsideRoom(zone: RoomZone, col: number, row: number): boolean {
  return col >= zone.minCol && col <= zone.maxCol && row >= zone.minRow && row <= zone.maxRow;
}

function roomVariantAt(col: number, row: number): number {
  for (const zone of ROOM_ZONES) {
    if (isInsideRoom(zone, col, row)) return zone.floorVariant;
  }
  // Doorway tile (interior wall tile that's been opened): inherit the variant
  // of the lower-indexed adjacent room so each doorway reads as belonging to
  // one side rather than as a void corridor.
  for (const zone of ROOM_ZONES) {
    if (col >= zone.minCol - 1 && col <= zone.maxCol + 1 && row >= zone.minRow - 1 && row <= zone.maxRow + 1) {
      return zone.floorVariant;
    }
  }
  return 0;
}

function isInteriorWall(col: number, row: number): boolean {
  // Perimeter
  if (row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1) return true;
  // Vertical interior walls (skip doorway rows)
  if (INTERIOR_WALL_COLS.has(col) && !VERT_DOOR_ROWS.has(row)) return true;
  // Horizontal interior wall (skip doorway cols, and skip where vertical walls cross)
  if (row === INTERIOR_WALL_ROW) {
    if (HORIZ_DOOR_COLS.has(col)) return false;
    if (INTERIOR_WALL_COLS.has(col)) return true;
    return true;
  }
  return false;
}

function blockTile(b: Builder, col: number, row: number): void {
  if (row >= 0 && row < b.rows && col >= 0 && col < b.cols) {
    b.blocked.add(`${col},${row}`);
  }
}

function pushBlocked(b: Builder, col: number, row: number, w: number, h: number): void {
  for (let dr = 0; dr < h; dr++) {
    for (let dc = 0; dc < w; dc++) {
      blockTile(b, col + dc, row + dr);
    }
  }
}

function addFurniture(b: Builder, f: FurnitureInstance, blockFootprint = true): void {
  b.furniture.push(f);
  if (blockFootprint && f.blocking) pushBlocked(b, f.col, f.row, f.w, f.h);
}

function addSeat(b: Builder, col: number, row: number, facing: Direction): void {
  b.seats.push({
    id: `seat-${b.seatCounter}`,
    col,
    row,
    facingDir: facing,
    assignedRole: null,
    kind: 'desk',
  });
  b.seatCounter += 1;
}

/** Build a focus-room desk cluster facing UP (chair south of desk). */
function addFocusTopDesk(b: Builder, leftCol: number): void {
  const seatId = b.seatCounter;
  addFurniture(b, {
    id: `desk-${seatId}`, kind: 'desk', variant: 'front',
    col: leftCol, row: FOCUS_TOP_DESK_ROW, w: DESK_WIDTH, h: 2, blocking: true,
  });
  addFurniture(b, {
    id: `pc-${seatId}`, kind: 'pc', variant: 'back',
    col: leftCol + 1, row: FOCUS_TOP_DESK_ROW - 1, w: 1, h: 1,
    spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: `chair-${seatId}`, kind: 'chair', variant: 'front',
    col: leftCol + 1, row: FOCUS_TOP_CHAIR_ROW, w: 1, h: 1,
    spriteOverhangRows: 1, blocking: false,
  }, false);
  addSeat(b, leftCol + 1, FOCUS_TOP_CHAIR_ROW, Direction.UP);
}

/** Build a focus-room desk cluster facing DOWN (chair north of desk). */
function addFocusBottomDesk(b: Builder, leftCol: number): void {
  const seatId = b.seatCounter;
  addFurniture(b, {
    id: `desk-${seatId}`, kind: 'desk', variant: 'front',
    col: leftCol, row: FOCUS_BOTTOM_DESK_ROW, w: DESK_WIDTH, h: 2, blocking: true,
  });
  addFurniture(b, {
    id: `pc-${seatId}`, kind: 'pc', variant: 'front',
    col: leftCol + 1, row: FOCUS_BOTTOM_DESK_ROW - 1, w: 1, h: 1,
    spriteOverhangRows: 1, blocking: false, animated: true,
  }, false);
  addFurniture(b, {
    id: `chair-${seatId}`, kind: 'chair', variant: 'back',
    col: leftCol + 1, row: FOCUS_BOTTOM_CHAIR_ROW, w: 1, h: 1,
    spriteOverhangRows: 1, blocking: false,
  }, false);
  addSeat(b, leftCol + 1, FOCUS_BOTTOM_CHAIR_ROW, Direction.DOWN);
}

/** Build an ops-room side desk against the east wall. Agent faces RIGHT. */
function addOpsSideDesk(b: Builder, topRow: number): void {
  const seatId = b.seatCounter;
  const deskCol = OPS_DESK_COL;
  addFurniture(b, {
    id: `desk-${seatId}`, kind: 'desk', variant: 'side',
    col: deskCol, row: topRow, w: 1, h: DESK_WIDTH, blocking: true,
  });
  addFurniture(b, {
    id: `pc-${seatId}`, kind: 'pc', variant: 'side',
    col: deskCol, row: topRow + 1, w: 1, h: 1,
    spriteOverhangRows: 1, blocking: false,
  }, false);
  const chairCol = deskCol - 1;
  const chairRow = topRow + 1;
  addFurniture(b, {
    id: `chair-${seatId}`, kind: 'chair', variant: 'side',
    col: chairCol, row: chairRow, w: 1, h: 1,
    spriteOverhangRows: 1, blocking: false,
  }, false);
  addSeat(b, chairCol, chairRow, Direction.RIGHT);
}

/** Build the reception desk in the bottom-left room. Facing south (visitors
 *  approach from the entry doorway). Single desk seat for an overflow agent. */
function addReceptionDesk(b: Builder): void {
  const seatId = b.seatCounter;
  const leftCol = 4;
  const deskRow = 17;
  // Front-facing reception counter (chair north of desk → agent faces DOWN).
  addFurniture(b, {
    id: `desk-${seatId}`, kind: 'desk', variant: 'front',
    col: leftCol, row: deskRow, w: DESK_WIDTH, h: 2, blocking: true,
  });
  addFurniture(b, {
    id: `pc-${seatId}`, kind: 'pc', variant: 'front',
    col: leftCol + 1, row: deskRow - 1, w: 1, h: 1,
    spriteOverhangRows: 1, blocking: true, animated: true,
  });
  addFurniture(b, {
    id: `chair-${seatId}`, kind: 'chair', variant: 'back',
    col: leftCol + 1, row: deskRow - 2, w: 1, h: 1,
    spriteOverhangRows: 1, blocking: false,
  }, false);
  addSeat(b, leftCol + 1, deskRow - 2, Direction.DOWN);
}

/** Decorate the meeting room: central table, whiteboard, plants, bookshelf. */
function buildMeetingRoom(b: Builder): void {
  // Central conference table (3x1). Also block the north visual edge so
  // 32px-tall characters cannot appear to walk through the tabletop.
  const tableCol = 19;
  const tableRow = 6;
  addFurniture(b, {
    id: 'meeting-table', kind: 'table', variant: 'front',
    col: tableCol, row: tableRow, w: 3, h: 1, blocking: true,
  });
  pushBlocked(b, tableCol, tableRow - 1, 3, 1);
  // Wall-mounted whiteboard above the table (sprite overhangs into row 0).
  addFurniture(b, {
    id: 'meeting-whiteboard', kind: 'whiteboard', variant: 'front',
    col: 19, row: 1, w: 2, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'meeting-queue-board', kind: 'queue_board', variant: 'front',
    col: 21, row: 1, w: 3, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  // Clock and paintings flanking the whiteboard.
  addFurniture(b, {
    id: 'meeting-clock', kind: 'clock', variant: 'front',
    col: 16, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'meeting-painting-large', kind: 'large_painting', variant: 'front',
    col: 23, row: 1, w: 2, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  // Hanging plants for warmth.
  addFurniture(b, {
    id: 'meeting-hang-0', kind: 'hanging_plant', variant: 'front',
    col: 15, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
  }, false);
  addFurniture(b, {
    id: 'meeting-hang-1', kind: 'hanging_plant', variant: 'front',
    col: 26, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
  }, false);
  // Floor plants around the room edges.
  addFurniture(b, {
    id: 'meeting-plant-0', kind: 'large_plant', variant: 'front',
    col: 15, row: 11, w: 2, h: 2, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'meeting-plant-1', kind: 'cactus', variant: 'front',
    col: 26, row: 11, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
}

/** Decorate the ops room (right column, top). Bookshelves on west wall. */
function buildOpsRoom(b: Builder): void {
  for (const top of OPS_DESK_TOP_ROWS) {
    addOpsSideDesk(b, top);
  }
  // Bookshelves stacked along the west interior wall (col 29 interior).
  addFurniture(b, {
    id: 'ops-shelf-0', kind: 'double_bookshelf', variant: 'front',
    col: 29, row: 2, w: 2, h: 2, blocking: true,
  });
  addFurniture(b, {
    id: 'ops-shelf-1', kind: 'bookshelf', variant: 'front',
    col: 29, row: 11, w: 2, h: 1, blocking: true,
  });
  // Plant near the doorway.
  addFurniture(b, {
    id: 'ops-plant-0', kind: 'plant', variant: 'front',
    col: 29, row: 5, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  // Small painting on the top wall.
  addFurniture(b, {
    id: 'ops-painting-0', kind: 'small_painting', variant: 'front',
    col: 33, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'ops-status-wall', kind: 'status_wall', variant: 'front',
    col: 34, row: 1, w: 3, h: 1, spriteOverhangRows: 1, blocking: true,
  });
}

/** Decorate the focus room: 6 desk seats (3 top + 3 bottom), plus wall art. */
function buildFocusRoom(b: Builder): void {
  for (const col of FOCUS_DESK_COLS) addFocusTopDesk(b, col);
  for (const col of FOCUS_DESK_COLS) addFocusBottomDesk(b, col);
  // Small paintings on top wall between the desks.
  addFurniture(b, {
    id: 'focus-painting-0', kind: 'small_painting', variant: 'front',
    col: 5, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'focus-painting-1', kind: 'small_painting', variant: 'front',
    col: 9, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'focus-review-terminal', kind: 'review_terminal', variant: 'front',
    col: 11, row: 7, w: 2, h: 2, blocking: true,
  });
  // Hanging plants in the corners.
  addFurniture(b, {
    id: 'focus-hang-0', kind: 'hanging_plant', variant: 'front',
    col: 1, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
  }, false);
  addFurniture(b, {
    id: 'focus-hang-1', kind: 'hanging_plant', variant: 'front',
    col: 13, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false,
  }, false);
  // Cactus on the floor in the aisle near a desk.
  addFurniture(b, {
    id: 'focus-cactus-0', kind: 'cactus', variant: 'front',
    col: 13, row: 7, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
}

/** Decorate the reception room (bottom-left). Entry zone with desk + bench. */
function buildReceptionRoom(b: Builder): void {
  addReceptionDesk(b);
  // Waiting bench on the right side of the room.
  addFurniture(b, {
    id: 'recept-bench-0', kind: 'cushioned_bench', variant: 'front',
    col: 10, row: 20, w: 1, h: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'recept-bench-1', kind: 'cushioned_bench', variant: 'front',
    col: 11, row: 20, w: 1, h: 1, blocking: true,
  });
  // Small table next to the benches.
  addFurniture(b, {
    id: 'recept-table-0', kind: 'small_table', variant: 'front',
    col: 12, row: 20, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  // Plants and painting for atmosphere.
  addFurniture(b, {
    id: 'recept-plant-0', kind: 'large_plant', variant: 'front',
    col: 1, row: 22, w: 2, h: 2, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'recept-painting-0', kind: 'large_painting', variant: 'front',
    col: 7, row: 14, w: 2, h: 1, spriteOverhangRows: 1, blocking: true,
  });
}

/** Decorate the lounge (bottom-middle). Sofa cluster + coffee table. */
function buildLoungeRoom(b: Builder): void {
  // Three-piece sofa cluster facing the coffee table.
  addFurniture(b, {
    id: 'lounge-sofa-front', kind: 'sofa', variant: 'front',
    col: 20, row: 18, w: 2, h: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'lounge-sofa-left', kind: 'sofa', variant: 'side',
    col: 19, row: 18, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'lounge-sofa-right', kind: 'sofa', variant: 'side-mirror',
    col: 22, row: 18, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  // Coffee table in front.
  addFurniture(b, {
    id: 'lounge-coffee-table', kind: 'coffee_table', variant: 'front',
    col: 20, row: 20, w: 2, h: 1, blocking: true,
  });
  // Utility counter: coffee maker plus a small wash station for office errands.
  addFurniture(b, {
    id: 'lounge-coffee-maker', kind: 'coffee', variant: 'front',
    col: 24, row: 19, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  // The coffee sprite overhangs upward/downward visually; reserve the counter
  // tile and interact from the side rather than standing inside the pot.
  addFurniture(b, {
    id: 'lounge-wash-counter', kind: 'small_table', variant: 'front',
    col: 24, row: 22, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'lounge-bin', kind: 'bin', variant: 'front',
    col: 23, row: 22, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  // Reading nook on the left side of the lounge.
  addFurniture(b, {
    id: 'lounge-nook-bench', kind: 'cushioned_bench', variant: 'front',
    col: 16, row: 20, w: 1, h: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'lounge-nook-table', kind: 'small_table', variant: 'side',
    col: 17, row: 20, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  // Plants framing the lounge.
  addFurniture(b, {
    id: 'lounge-plant-0', kind: 'plant', variant: 'front',
    col: 15, row: 14, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'lounge-plant-1', kind: 'plant', variant: 'front',
    col: 26, row: 14, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'lounge-large-plant', kind: 'large_plant', variant: 'front',
    col: 26, row: 22, w: 2, h: 2, spriteOverhangRows: 1, blocking: true,
  });
}

/** Decorate the library (bottom-right). Stacks of bookshelves. */
function buildLibraryRoom(b: Builder): void {
  // Two rows of double bookshelves running along the east wall.
  addFurniture(b, {
    id: 'lib-shelf-0', kind: 'double_bookshelf', variant: 'front',
    col: 35, row: 15, w: 2, h: 2, blocking: true,
  });
  addFurniture(b, {
    id: 'lib-shelf-1', kind: 'double_bookshelf', variant: 'front',
    col: 35, row: 18, w: 2, h: 2, blocking: true,
  });
  addFurniture(b, {
    id: 'lib-shelf-2', kind: 'bookshelf', variant: 'front',
    col: 35, row: 21, w: 2, h: 1, blocking: true,
  });
  // Reading nook on the west side.
  addFurniture(b, {
    id: 'lib-bench-0', kind: 'cushioned_bench', variant: 'front',
    col: 29, row: 17, w: 1, h: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'lib-small-table', kind: 'small_table', variant: 'front',
    col: 30, row: 17, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'lib-bench-1', kind: 'cushioned_bench', variant: 'front',
    col: 31, row: 17, w: 1, h: 1, blocking: true,
  });
  // Cactus and plant for greenery.
  addFurniture(b, {
    id: 'lib-cactus-0', kind: 'cactus', variant: 'front',
    col: 29, row: 22, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
  addFurniture(b, {
    id: 'lib-painting-0', kind: 'small_painting', variant: 'front',
    col: 32, row: 14, w: 1, h: 1, spriteOverhangRows: 1, blocking: true,
  });
}

/**
 * Create the office layout. `minSeats` controls how many desk seats are
 * needed at minimum — the layout always builds the full furniture set
 * (rooms are not torn down based on agent count) but seats are emitted in
 * priority order so the first N seats correspond to the most prominent
 * desks for the first N agents.
 */
export function createLayout(_minSeats: number): OfficeLayout {
  const cols = COLS;
  const rows = ROWS;

  const tiles: TileType[][] = [];
  const floorVariants: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const tileRow: TileType[] = [];
    const variantRow: number[] = [];
    for (let c = 0; c < cols; c++) {
      const wall = isInteriorWall(c, r);
      tileRow.push(wall ? TileType.WALL : TileType.FLOOR);
      variantRow.push(wall ? 0 : roomVariantAt(c, r));
    }
    tiles.push(tileRow);
    floorVariants.push(variantRow);
  }

  const b: Builder = {
    cols, rows, tiles, floorVariants,
    furniture: [],
    seats: [],
    blocked: new Set<string>(),
    seatCounter: 0,
  };

  // Seats are appended in priority order: focus first (lead → seat 0,
  // worker → seat 1), then ops, then reception. Decorative furniture for
  // each room is also added inside the room builder.
  buildFocusRoom(b);
  buildOpsRoom(b);
  buildMeetingRoom(b);
  buildReceptionRoom(b);
  buildLoungeRoom(b);
  buildLibraryRoom(b);

  return {
    cols, rows, tiles, floorVariants,
    furniture: b.furniture,
    seats: b.seats,
    blocked: b.blocked,
    rooms: [...ROOM_ZONES],
    activities: officeActivities(b),
  };
}

export interface MeetingSpot {
  col: number;
  row: number;
}

function isWalkable(layout: OfficeLayout, spot: MeetingSpot): boolean {
  return (
    spot.col > 0 &&
    spot.col < layout.cols - 1 &&
    spot.row > 0 &&
    spot.row < layout.rows - 1 &&
    !layout.blocked.has(`${spot.col},${spot.row}`) &&
    layout.tiles[spot.row][spot.col] !== TileType.WALL &&
    layout.tiles[spot.row][spot.col] !== TileType.VOID
  );
}

function fallbackSpot(layout: OfficeLayout): MeetingSpot {
  return { col: Math.floor(layout.cols / 2), row: Math.floor(layout.rows / 2) };
}

/** Returns a tile adjacent to the meeting table where an agent can stand. */
export function meetingSpotFor(layout: OfficeLayout, index: number): MeetingSpot {
  const spots: MeetingSpot[] = [
    { col: 19, row: 7 }, { col: 20, row: 7 }, { col: 21, row: 7 },
    { col: 18, row: 6 }, { col: 22, row: 6 },
    { col: 18, row: 7 }, { col: 22, row: 7 },
  ];
  const ok = spots.filter((spot) => isWalkable(layout, spot));
  if (ok.length === 0) return fallbackSpot(layout);
  return ok[index % ok.length];
}

function officeActivities(layout: Pick<OfficeLayout, 'cols' | 'rows' | 'tiles' | 'blocked'>): OfficeActivityDestination[] {
  const candidates: OfficeActivityDestination[] = [
    { id: 'whiteboard-review', label: 'Review board', col: 20, row: 2, facingDir: Direction.UP, state: CharacterState.READ, durationSec: 3.8 },
    { id: 'ops-console', label: 'Check console', col: 36, row: 3, facingDir: Direction.RIGHT, state: CharacterState.TYPE, durationSec: 3.5 },
    { id: 'ops-file', label: 'File notes', col: 31, row: 11, facingDir: Direction.LEFT, state: CharacterState.READ, durationSec: 3.2 },
    { id: 'front-desk', label: 'Sort mail', col: 12, row: 19, facingDir: Direction.LEFT, state: CharacterState.READ, durationSec: 3.0 },
    { id: 'coffee-maker', label: 'Pour coffee', col: 25, row: 19, facingDir: Direction.LEFT, state: CharacterState.COFFEE, durationSec: 2.8 },
    { id: 'wash-station', label: 'Wash hands', col: 25, row: 22, facingDir: Direction.LEFT, state: CharacterState.WASH, durationSec: 3.0 },
    { id: 'library-reference', label: 'Find reference', col: 34, row: 17, facingDir: Direction.RIGHT, state: CharacterState.READ, durationSec: 4.0 },
    { id: 'lounge-read', label: 'Read brief', col: 16, row: 19, facingDir: Direction.DOWN, state: CharacterState.READ, durationSec: 3.6 },
  ];
  return candidates.filter((activity) => isWalkable(layout as OfficeLayout, activity));
}

export function ambientErrandSpotFor(layout: OfficeLayout, index: number): MeetingSpot {
  const activity = officeActivityFor(layout, index);
  return activity ?? wanderSpotFor(layout, index);
}

export function officeActivityFor(layout: OfficeLayout, index: number): OfficeActivityDestination | null {
  const ok = layout.activities.filter((activity) => isWalkable(layout, activity));
  if (ok.length === 0) return null;
  return ok[Math.abs(index) % ok.length];
}

/** Returns a deterministic walkable wander target, biased toward a room. */
export function wanderSpotFor(layout: OfficeLayout, seed: number, preferredRoomId?: string): { col: number; row: number } {
  const preferred = preferredRoomId ? layout.rooms.find((zone) => zone.id === preferredRoomId) : null;
  const rooms = preferred ? [preferred] : layout.rooms;
  const candidates: Array<{ col: number; row: number }> = [];
  for (const zone of rooms) {
    for (let r = zone.minRow + 1; r <= zone.maxRow - 1; r++) {
      for (let c = zone.minCol + 1; c <= zone.maxCol - 1; c++) {
        if (layout.blocked.has(`${c},${r}`)) continue;
        if (layout.tiles[r][c] === TileType.WALL || layout.tiles[r][c] === TileType.VOID) continue;
        candidates.push({ col: c, row: r });
      }
    }
  }
  if (candidates.length === 0 && preferredRoomId) return wanderSpotFor(layout, seed);
  if (candidates.length === 0) return { col: Math.floor(layout.cols / 2), row: Math.floor(layout.rows / 2) };
  return candidates[Math.abs(seed) % candidates.length];
}

export const LAYOUT_TILE_COLS = COLS;
export const LAYOUT_TILE_ROWS = ROWS;
