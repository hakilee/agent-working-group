/**
 * Workshop office layout - Gather-style social office rebuilt as a dense tile
 * map: enclosed rooms, visible doors, compact circulation, and prop clusters.
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

const COLS = 52;
const ROWS = 34;
const DESK_WIDTH = 3;

const ROOM_ZONES: ReadonlyArray<RoomZone> = [
  { id: 'north-workshop', label: 'Maker Lab', minCol: 1, maxCol: 18, minRow: 1, maxRow: 10, floorVariant: 1 },
  { id: 'east-studio', label: 'Focus Studio', minCol: 33, maxCol: 50, minRow: 1, maxRow: 10, floorVariant: 2 },
  { id: 'west-open-office', label: 'Desk Room', minCol: 1, maxCol: 18, minRow: 12, maxRow: 22, floorVariant: 1 },
  { id: 'central-garden', label: 'Courtyard', minCol: 20, maxCol: 31, minRow: 10, maxRow: 22, floorVariant: 0 },
  { id: 'meeting-lounge', label: 'Meeting Lounge', minCol: 33, maxCol: 50, minRow: 12, maxRow: 22, floorVariant: 6 },
  { id: 'reception', label: 'Reception', minCol: 1, maxCol: 18, minRow: 24, maxRow: 32, floorVariant: 2 },
  { id: 'south-spine', label: 'Tool Hall', minCol: 20, maxCol: 31, minRow: 24, maxRow: 32, floorVariant: 1 },
  { id: 'garden-cafe', label: 'Cafe Patio', minCol: 33, maxCol: 50, minRow: 24, maxRow: 32, floorVariant: 7 },
];

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
  // Keep the campus on a small Gather-like material set; props create room identity.
  if (col >= 20 && col <= 31 && row >= 10 && row <= 22) {
    const isPathEdge = col <= 23 || col >= 28 || row <= 13 || row >= 19;
    return isPathEdge ? 0 : 2;
  }
  if ((col >= 18 && col <= 33 && row >= 10 && row <= 13) || (col >= 18 && col <= 33 && row >= 22 && row <= 25)) return 0;
  if ((col >= 23 && col <= 28 && row >= 1 && row <= 32) || (col >= 6 && col <= 45 && row >= 25 && row <= 27)) return 0;
  if ((col >= 36 && col <= 49 && row >= 26 && row <= 31) || (col >= 3 && col <= 16 && row >= 26 && row <= 30)) return 7;
  if ((col >= 3 && col <= 16 && row >= 7 && row <= 8) || (col >= 36 && col <= 48 && row >= 7 && row <= 8)) return 1;
  if ((col >= 2 && col <= 8 && row >= 28 && row <= 31) || (col >= 22 && col <= 29 && row >= 28 && row <= 31)) return 2;
  for (const zone of ROOM_ZONES) {
    if (isInsideRoom(zone, col, row)) return zone.floorVariant;
  }
  return 0;
}

function inRange(v: number, a: number, b: number): boolean {
  return v >= a && v <= b;
}

function isWall(col: number, row: number): boolean {
  if (row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1) return true;

  // Horizontal room bands. Wide cuts act as Gather-style doorways.
  if (row === 11 && inRange(col, 1, 18) && !inRange(col, 7, 11) && !inRange(col, 16, 18)) return true;
  if (row === 11 && inRange(col, 20, 31) && !inRange(col, 24, 27)) return true;
  if (row === 11 && inRange(col, 33, 50) && !inRange(col, 39, 44) && !inRange(col, 33, 35)) return true;
  if (row === 23 && inRange(col, 1, 18) && !inRange(col, 7, 12) && !inRange(col, 16, 18)) return true;
  if (row === 23 && inRange(col, 20, 31) && !inRange(col, 24, 27)) return true;
  if (row === 23 && inRange(col, 33, 50) && !inRange(col, 33, 38) && !inRange(col, 44, 48)) return true;

  // Vertical partitions. Door gaps face the paver spine and courtyard.
  if (col === 19 && inRange(row, 1, 10) && !inRange(row, 4, 7)) return true;
  if (col === 32 && inRange(row, 1, 10) && !inRange(row, 4, 7)) return true;
  if (col === 19 && inRange(row, 12, 22) && !inRange(row, 15, 18)) return true;
  if (col === 20 && inRange(row, 12, 22) && !inRange(row, 15, 18)) return true;
  if (col === 31 && inRange(row, 12, 22) && !inRange(row, 15, 18)) return true;
  if (col === 32 && inRange(row, 12, 22) && !inRange(row, 15, 18) && !inRange(row, 20, 22)) return true;
  if (col === 19 && inRange(row, 24, 32) && !inRange(row, 26, 29)) return true;
  if (col === 32 && inRange(row, 24, 32) && !inRange(row, 26, 29)) return true;

  // Small interior nubs create alcoves without sealing navigation.
  if ((col === 6 || col === 13) && inRange(row, 2, 4)) return true;
  if ((col === 38 || col === 46) && inRange(row, 2, 4)) return true;
  if (row === 17 && inRange(col, 2, 5)) return true;
  if (row === 17 && inRange(col, 46, 49)) return true;
  return false;
}

function blockTile(b: Builder, col: number, row: number): void {
  if (row >= 0 && row < b.rows && col >= 0 && col < b.cols) b.blocked.add(`${col},${row}`);
}

function pushBlocked(b: Builder, col: number, row: number, w: number, h: number): void {
  for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) blockTile(b, col + dc, row + dr);
}

function addFurniture(b: Builder, f: FurnitureInstance, blockFootprint = true): void {
  b.furniture.push(f);
  if (blockFootprint && f.blocking) pushBlocked(b, f.col, f.row, f.w, f.h);
}

function addSeat(b: Builder, col: number, row: number, facing: Direction, kind: 'desk' | 'meeting' = 'desk'): void {
  b.seats.push({ id: `seat-${b.seatCounter}`, col, row, facingDir: facing, assignedRole: null, kind });
  b.seatCounter += 1;
}

function addTopDesk(b: Builder, leftCol: number, deskRow: number): void {
  const seatId = b.seatCounter;
  addFurniture(b, { id: `desk-${seatId}`, kind: 'desk', variant: 'front', col: leftCol, row: deskRow, w: DESK_WIDTH, h: 2, blocking: true });
  addFurniture(b, { id: `pc-${seatId}`, kind: 'pc', variant: 'back', col: leftCol + 1, row: deskRow - 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: `chair-${seatId}`, kind: 'chair', variant: 'front', col: leftCol + 1, row: deskRow + 2, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  addSeat(b, leftCol + 1, deskRow + 2, Direction.UP);
}

function addBottomDesk(b: Builder, leftCol: number, deskRow: number): void {
  const seatId = b.seatCounter;
  addFurniture(b, { id: `desk-${seatId}`, kind: 'desk', variant: 'front', col: leftCol, row: deskRow, w: DESK_WIDTH, h: 2, blocking: true });
  addFurniture(b, { id: `pc-${seatId}`, kind: 'pc', variant: 'front', col: leftCol + 1, row: deskRow - 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false, animated: true }, false);
  addFurniture(b, { id: `chair-${seatId}`, kind: 'chair', variant: 'back', col: leftCol + 1, row: deskRow - 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  addSeat(b, leftCol + 1, deskRow - 1, Direction.DOWN);
}

function addSideDesk(b: Builder, deskCol: number, topRow: number, facing: Direction): void {
  const seatId = b.seatCounter;
  const mirror = facing === Direction.LEFT;
  const chairCol = mirror ? deskCol + 1 : deskCol - 1;
  const variant = mirror ? 'side-mirror' : 'side';
  addFurniture(b, { id: `desk-${seatId}`, kind: 'desk', variant: 'side', col: deskCol, row: topRow, w: 1, h: 3, blocking: true });
  addFurniture(b, { id: `pc-${seatId}`, kind: 'pc', variant, col: deskCol, row: topRow + 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  addFurniture(b, { id: `chair-${seatId}`, kind: 'chair', variant, col: chairCol, row: topRow + 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  addSeat(b, chairCol, topRow + 1, facing);
}

function addCafeSet(b: Builder, id: string, col: number, row: number): void {
  addFurniture(b, { id: `${id}-table`, kind: 'coffee_table', variant: 'front', col, row, w: 2, h: 1, blocking: true });
  addFurniture(b, { id: `${id}-bench-n`, kind: 'cushioned_bench', variant: 'front', col, row: row - 1, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: `${id}-bench-s`, kind: 'cushioned_bench', variant: 'front', col: col + 1, row: row + 1, w: 1, h: 1, blocking: true });
}

function buildMakerLab(b: Builder): void {
  for (const col of [2, 7, 12]) addTopDesk(b, col, 5);
  addSideDesk(b, 17, 3, Direction.RIGHT);
  addFurniture(b, { id: 'lab-status-wall', kind: 'wall_panel', variant: 'front', col: 2, row: 1, w: 4, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'lab-pegboard-a', kind: 'wall_panel', variant: 'front', col: 7, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'lab-parts-shelf', kind: 'parts_shelf', variant: 'front', col: 9, row: 1, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'lab-tool-cabinet', kind: 'tool_cabinet', variant: 'front', col: 14, row: 1, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'lab-maker-bench', kind: 'maker_bench', variant: 'front', col: 7, row: 8, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'lab-spool', kind: 'cable_spool', variant: 'front', col: 3, row: 9, w: 2, h: 1, blocking: true });
  addFurniture(b, { id: 'lab-barrel', kind: 'hazard_barrel', variant: 'front', col: 16, row: 9, w: 1, h: 1, blocking: true });
}

function buildFocusStudio(b: Builder): void {
  for (const col of [35, 40, 45]) addTopDesk(b, col, 5);
  addSideDesk(b, 49, 3, Direction.LEFT);
  addFurniture(b, { id: 'focus-whiteboard', kind: 'whiteboard', variant: 'front', col: 34, row: 1, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'focus-window-a', kind: 'window_panel', variant: 'front', col: 37, row: 1, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'focus-queue-board', kind: 'wall_panel', variant: 'front', col: 42, row: 1, w: 3, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'focus-bookshelf', kind: 'double_bookshelf', variant: 'front', col: 47, row: 8, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'focus-plant', kind: 'large_plant', variant: 'front', col: 34, row: 8, w: 1, h: 2, spriteOverhangRows: 1, blocking: true });
}

function buildDeskRoom(b: Builder): void {
  for (const col of [3, 8, 13]) addBottomDesk(b, col, 19);
  for (const row of [13, 18]) addSideDesk(b, 17, row, Direction.RIGHT);
  addFurniture(b, { id: 'deskroom-bookshelf', kind: 'bookshelf', variant: 'front', col: 2, row: 12, w: 1, h: 2, blocking: true });
  addFurniture(b, { id: 'deskroom-window-a', kind: 'window_panel', variant: 'front', col: 8, row: 12, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'deskroom-window-b', kind: 'window_panel', variant: 'front', col: 12, row: 12, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'deskroom-terminal', kind: 'review_terminal', variant: 'front', col: 4, row: 20, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'deskroom-plant', kind: 'large_plant', variant: 'front', col: 14, row: 20, w: 2, h: 2, spriteOverhangRows: 1, blocking: true });
}

function buildCourtyard(b: Builder): void {
  addFurniture(b, { id: 'central-garden-bed-north', kind: 'garden_bed', variant: 'front', col: 22, row: 11, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'central-garden-bed-east', kind: 'garden_bed', variant: 'front', col: 28, row: 14, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'central-garden-bed-south', kind: 'garden_bed', variant: 'front', col: 27, row: 20, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'central-planter-island', kind: 'plaza_planter', variant: 'front', col: 24, row: 15, w: 3, h: 2, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'central-social-table', kind: 'coffee_table', variant: 'front', col: 24, row: 18, w: 2, h: 1, blocking: true });
  addFurniture(b, { id: 'central-tree-west', kind: 'large_plant', variant: 'front', col: 21, row: 18, w: 2, h: 2, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'central-tree-east', kind: 'large_plant', variant: 'front', col: 29, row: 12, w: 1, h: 2, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'central-bench-west', kind: 'cushioned_bench', variant: 'front', col: 21, row: 14, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: 'central-bench-east', kind: 'cushioned_bench', variant: 'front', col: 29, row: 18, w: 1, h: 1, blocking: true });
}

function buildGatherLounge(b: Builder): void {
  const tableCol = 39;
  const tableRow = 16;
  addFurniture(b, { id: 'meeting-table', kind: 'table', variant: 'front', col: tableCol, row: tableRow, w: 3, h: 1, blocking: true });
  pushBlocked(b, tableCol, tableRow - 1, 3, 1);
  addFurniture(b, { id: 'meeting-whiteboard', kind: 'whiteboard', variant: 'front', col: 36, row: 12, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'meeting-window-a', kind: 'window_panel', variant: 'front', col: 39, row: 12, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'meeting-queue-board', kind: 'wall_panel', variant: 'front', col: 43, row: 12, w: 3, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'meeting-sofa-west', kind: 'sofa', variant: 'front', col: 34, row: 20, w: 2, h: 1, blocking: true });
  addFurniture(b, { id: 'meeting-sofa-east', kind: 'sofa', variant: 'front', col: 47, row: 20, w: 2, h: 1, blocking: true });
  addFurniture(b, { id: 'meeting-coffee-maker', kind: 'coffee', variant: 'front', col: 48, row: 18, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'meeting-wash-counter', kind: 'small_table', variant: 'front', col: 48, row: 21, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addSeat(b, 39, 18, Direction.UP, 'meeting');
  addSeat(b, 40, 18, Direction.UP, 'meeting');
  addSeat(b, 41, 18, Direction.UP, 'meeting');
}

function buildReceptionAndHall(b: Builder): void {
  addBottomDesk(b, 4, 29);
  addFurniture(b, { id: 'reception-signage', kind: 'window_panel', variant: 'front', col: 5, row: 24, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'reception-window-a', kind: 'window_panel', variant: 'front', col: 9, row: 24, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'reception-window-b', kind: 'window_panel', variant: 'front', col: 13, row: 24, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'reception-bench-0', kind: 'cushioned_bench', variant: 'front', col: 11, row: 29, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: 'reception-bench-1', kind: 'cushioned_bench', variant: 'front', col: 13, row: 29, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: 'reception-plant', kind: 'large_plant', variant: 'front', col: 2, row: 30, w: 2, h: 2, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'spine-clock', kind: 'clock', variant: 'front', col: 25, row: 24, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'spine-tool-cabinet', kind: 'tool_cabinet', variant: 'front', col: 21, row: 30, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'spine-parts-shelf', kind: 'parts_shelf', variant: 'front', col: 28, row: 30, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'spine-hazard-barrel', kind: 'hazard_barrel', variant: 'front', col: 22, row: 28, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: 'spine-cable-spool', kind: 'cable_spool', variant: 'front', col: 28, row: 28, w: 2, h: 1, blocking: true });
}

function buildCafePatio(b: Builder): void {
  addCafeSet(b, 'terrace-cafe-west', 36, 27);
  addCafeSet(b, 'terrace-cafe-east', 45, 28);
  addFurniture(b, { id: 'terrace-coffee-cart', kind: 'coffee', variant: 'front', col: 48, row: 25, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'terrace-garden-bed', kind: 'garden_bed', variant: 'front', col: 35, row: 31, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'terrace-large-plant', kind: 'large_plant', variant: 'front', col: 49, row: 31, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'terrace-cactus', kind: 'cactus', variant: 'front', col: 33, row: 30, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
}

export function createLayout(_minSeats: number): OfficeLayout {
  const tiles: TileType[][] = [];
  const floorVariants: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const tileRow: TileType[] = [];
    const variantRow: number[] = [];
    for (let c = 0; c < COLS; c++) {
      const wall = isWall(c, r);
      tileRow.push(wall ? TileType.WALL : TileType.FLOOR);
      variantRow.push(wall ? 0 : roomVariantAt(c, r));
    }
    tiles.push(tileRow);
    floorVariants.push(variantRow);
  }

  const b: Builder = { cols: COLS, rows: ROWS, tiles, floorVariants, furniture: [], seats: [], blocked: new Set<string>(), seatCounter: 0 };
  buildMakerLab(b);
  buildFocusStudio(b);
  buildDeskRoom(b);
  buildCourtyard(b);
  buildGatherLounge(b);
  buildReceptionAndHall(b);
  buildCafePatio(b);

  return { cols: COLS, rows: ROWS, tiles, floorVariants, furniture: b.furniture, seats: b.seats, blocked: b.blocked, rooms: [...ROOM_ZONES], activities: officeActivities(b) };
}

export interface MeetingSpot { col: number; row: number; }

function isWalkable(layout: OfficeLayout, spot: MeetingSpot): boolean {
  return spot.col > 0 && spot.col < layout.cols - 1 && spot.row > 0 && spot.row < layout.rows - 1 && !layout.blocked.has(`${spot.col},${spot.row}`) && layout.tiles[spot.row][spot.col] !== TileType.WALL && layout.tiles[spot.row][spot.col] !== TileType.VOID;
}

function fallbackSpot(_layout: OfficeLayout): MeetingSpot {
  return { col: 25, row: 14 };
}

export function meetingSpotFor(layout: OfficeLayout, index: number): MeetingSpot {
  const spots: MeetingSpot[] = [
    { col: 39, row: 18 }, { col: 40, row: 18 }, { col: 41, row: 18 },
    { col: 38, row: 16 }, { col: 42, row: 16 }, { col: 38, row: 18 }, { col: 42, row: 18 },
  ];
  const ok = spots.filter((spot) => isWalkable(layout, spot));
  return ok.length === 0 ? fallbackSpot(layout) : ok[Math.abs(index) % ok.length];
}

function officeActivities(layout: Pick<OfficeLayout, 'cols' | 'rows' | 'tiles' | 'blocked'>): OfficeActivityDestination[] {
  const candidates: OfficeActivityDestination[] = [
    { id: 'central-garden-read', label: 'Read in garden', col: 28, row: 19, facingDir: Direction.DOWN, state: CharacterState.READ, durationSec: 3.8 },
    { id: 'terrace-coffee', label: 'Coffee outside', col: 47, row: 25, facingDir: Direction.RIGHT, state: CharacterState.COFFEE, durationSec: 3.0 },
    { id: 'terrace-table-chat', label: 'Cafe table', col: 38, row: 27, facingDir: Direction.LEFT, state: CharacterState.COFFEE, durationSec: 3.2 },
    { id: 'whiteboard-review', label: 'Review board', col: 37, row: 13, facingDir: Direction.UP, state: CharacterState.READ, durationSec: 3.8 },
    { id: 'ops-console', label: 'Ops console', col: 6, row: 20, facingDir: Direction.LEFT, state: CharacterState.TYPE, durationSec: 4.2 },
    { id: 'coffee-maker', label: 'Coffee maker', col: 47, row: 18, facingDir: Direction.RIGHT, state: CharacterState.COFFEE, durationSec: 2.8 },
    { id: 'wash-station', label: 'Wash station', col: 47, row: 21, facingDir: Direction.RIGHT, state: CharacterState.WASH, durationSec: 2.8 },
  ];
  return candidates.filter((spot) => isWalkable(layout as OfficeLayout, spot));
}

export function ambientErrandSpotFor(layout: OfficeLayout, index: number): MeetingSpot {
  return officeActivityFor(layout, index) ?? wanderSpotFor(layout, index);
}

export function officeActivityFor(layout: OfficeLayout, index: number): OfficeActivityDestination | null {
  const ok = layout.activities.filter((activity) => isWalkable(layout, activity));
  return ok.length === 0 ? null : ok[Math.abs(index) % ok.length];
}

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
  if (candidates.length === 0) return fallbackSpot(layout);
  return candidates[Math.abs(seed) % candidates.length];
}

export const LAYOUT_TILE_COLS = COLS;
export const LAYOUT_TILE_ROWS = ROWS;
