/**
 * Workshop office layout - realistic office floor rebuilt around a central work
 * spine, meeting/client rooms, cafe lounge, and an indoor garden atrium with a
 * fountain tower. The map keeps explicit furniture footprints so runtime
 * pathfinding matches what users see on screen.
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
const DESK_WIDTH = 3;

const OPEN_TOP_DESK_ROW = 3;
const OPEN_TOP_CHAIR_ROW = 5;
const OPEN_BOTTOM_DESK_ROW = 10;
const OPEN_BOTTOM_CHAIR_ROW = 9;
const OPEN_DESK_COLS = [2, 6, 10, 14, 18] as const;

const ROOM_ZONES: ReadonlyArray<RoomZone> = [
  { id: 'open-office', label: 'Open Office', minCol: 1, maxCol: 23, minRow: 1, maxRow: 15, floorVariant: 1 },
  { id: 'meeting-suite', label: 'Meeting Suite', minCol: 25, maxCol: 38, minRow: 1, maxRow: 10, floorVariant: 2 },
  { id: 'cafe-lounge', label: 'Cafe Lounge', minCol: 25, maxCol: 38, minRow: 12, maxRow: 17, floorVariant: 4 },
  { id: 'garden-atrium', label: 'Garden Atrium', minCol: 24, maxCol: 38, minRow: 18, maxRow: 24, floorVariant: 8 },
  { id: 'main-spine', label: 'Main Spine', minCol: 1, maxCol: 38, minRow: 16, maxRow: 16, floorVariant: 6 },
  { id: 'reception', label: 'Reception', minCol: 1, maxCol: 13, minRow: 17, maxRow: 24, floorVariant: 0 },
  { id: 'ops-corridor', label: 'Ops Corridor', minCol: 14, maxCol: 23, minRow: 17, maxRow: 24, floorVariant: 6 },
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
  for (const zone of ROOM_ZONES) {
    if (isInsideRoom(zone, col, row)) return zone.floorVariant;
  }
  return 0;
}

function isWall(col: number, row: number): boolean {
  if (row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1) return true;

  // East-side program bar: meeting room above, cafe below, garden at the end.
  if (col === 24 && row >= 1 && row <= 17 && ![5, 6, 14, 15, 16].includes(row)) return true;
  if (row === 11 && col >= 24 && col <= 38 && ![31, 32].includes(col)) return true;
  if (row === 18 && col >= 24 && col <= 38 && ![30, 31, 32, 33, 34].includes(col)) return true;

  // Row 16 is a continuous main spine, connecting lobby, desks, cafe, and garden.
  if (col === 14 && row >= 17 && row <= 24 && ![20, 21].includes(row)) return true;

  // A short glass nib implies an entry vestibule without boxing in the lobby.
  if (col === 8 && row >= 18 && row <= 21) return true;
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

function addSeat(b: Builder, col: number, row: number, facing: Direction): void {
  b.seats.push({ id: `seat-${b.seatCounter}`, col, row, facingDir: facing, assignedRole: null, kind: 'desk' });
  b.seatCounter += 1;
}

function addTopDesk(b: Builder, leftCol: number): void {
  const seatId = b.seatCounter;
  addFurniture(b, { id: `desk-${seatId}`, kind: 'desk', variant: 'front', col: leftCol, row: OPEN_TOP_DESK_ROW, w: DESK_WIDTH, h: 2, blocking: true });
  addFurniture(b, { id: `pc-${seatId}`, kind: 'pc', variant: 'back', col: leftCol + 1, row: OPEN_TOP_DESK_ROW - 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: `chair-${seatId}`, kind: 'chair', variant: 'front', col: leftCol + 1, row: OPEN_TOP_CHAIR_ROW, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  addSeat(b, leftCol + 1, OPEN_TOP_CHAIR_ROW, Direction.UP);
}

function addBottomDesk(b: Builder, leftCol: number): void {
  const seatId = b.seatCounter;
  addFurniture(b, { id: `desk-${seatId}`, kind: 'desk', variant: 'front', col: leftCol, row: OPEN_BOTTOM_DESK_ROW, w: DESK_WIDTH, h: 2, blocking: true });
  addFurniture(b, { id: `pc-${seatId}`, kind: 'pc', variant: 'front', col: leftCol + 1, row: OPEN_BOTTOM_DESK_ROW - 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false, animated: true }, false);
  addFurniture(b, { id: `chair-${seatId}`, kind: 'chair', variant: 'back', col: leftCol + 1, row: OPEN_BOTTOM_CHAIR_ROW, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  addSeat(b, leftCol + 1, OPEN_BOTTOM_CHAIR_ROW, Direction.DOWN);
}

function addReceptionDesk(b: Builder): void {
  const seatId = b.seatCounter;
  addFurniture(b, { id: `desk-${seatId}`, kind: 'desk', variant: 'front', col: 3, row: 19, w: DESK_WIDTH, h: 2, blocking: true });
  addFurniture(b, { id: `pc-${seatId}`, kind: 'pc', variant: 'front', col: 4, row: 18, w: 1, h: 1, spriteOverhangRows: 1, blocking: true, animated: true });
  addFurniture(b, { id: `chair-${seatId}`, kind: 'chair', variant: 'back', col: 4, row: 17, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  addSeat(b, 4, 17, Direction.DOWN);
}

function buildOpenOffice(b: Builder): void {
  for (const col of OPEN_DESK_COLS) addTopDesk(b, col);
  for (const col of OPEN_DESK_COLS) addBottomDesk(b, col);

  addFurniture(b, { id: 'office-status-wall', kind: 'status_wall', variant: 'front', col: 6, row: 1, w: 3, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'office-review-terminal', kind: 'review_terminal', variant: 'front', col: 20, row: 13, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'office-shelf-0', kind: 'double_bookshelf', variant: 'front', col: 21, row: 1, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'office-plant-0', kind: 'large_plant', variant: 'front', col: 1, row: 13, w: 2, h: 2, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'office-plant-1', kind: 'plant', variant: 'front', col: 22, row: 7, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'office-hang-0', kind: 'hanging_plant', variant: 'front', col: 1, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  addFurniture(b, { id: 'office-hang-1', kind: 'hanging_plant', variant: 'front', col: 13, row: 1, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
}

function buildMeetingSuite(b: Builder): void {
  const tableCol = 30;
  const tableRow = 5;
  addFurniture(b, { id: 'meeting-table', kind: 'table', variant: 'front', col: tableCol, row: tableRow, w: 3, h: 1, blocking: true });
  pushBlocked(b, tableCol, tableRow - 1, 3, 1);
  addFurniture(b, { id: 'meeting-whiteboard', kind: 'whiteboard', variant: 'front', col: 28, row: 1, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'meeting-queue-board', kind: 'queue_board', variant: 'front', col: 31, row: 1, w: 3, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'meeting-painting', kind: 'large_painting', variant: 'front', col: 36, row: 1, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'meeting-plant-0', kind: 'plant', variant: 'front', col: 25, row: 9, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'meeting-plant-1', kind: 'large_plant', variant: 'front', col: 36, row: 8, w: 2, h: 2, spriteOverhangRows: 1, blocking: true });
}

function buildCafeLounge(b: Builder): void {
  addFurniture(b, { id: 'lounge-sofa-front', kind: 'sofa', variant: 'front', col: 27, row: 14, w: 2, h: 1, blocking: true });
  addFurniture(b, { id: 'lounge-coffee-table', kind: 'coffee_table', variant: 'front', col: 29, row: 15, w: 2, h: 1, blocking: true });
  addFurniture(b, { id: 'lounge-sofa-back', kind: 'sofa', variant: 'back', col: 31, row: 15, w: 2, h: 1, blocking: true });
  addFurniture(b, { id: 'lounge-coffee-maker', kind: 'coffee', variant: 'front', col: 36, row: 13, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'lounge-wash-counter', kind: 'small_table', variant: 'front', col: 36, row: 16, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'lounge-bin', kind: 'bin', variant: 'front', col: 37, row: 16, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'lounge-plant', kind: 'plant', variant: 'front', col: 25, row: 16, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
}

function buildReceptionAndOps(b: Builder): void {
  addReceptionDesk(b);
  addFurniture(b, { id: 'reception-bench-0', kind: 'cushioned_bench', variant: 'front', col: 10, row: 21, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: 'reception-bench-1', kind: 'cushioned_bench', variant: 'front', col: 11, row: 21, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: 'reception-table', kind: 'small_table', variant: 'front', col: 12, row: 21, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'reception-painting', kind: 'large_painting', variant: 'front', col: 9, row: 17, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'reception-plant', kind: 'large_plant', variant: 'front', col: 1, row: 22, w: 2, h: 2, spriteOverhangRows: 1, blocking: true });

  addFurniture(b, { id: 'ops-bookshelf', kind: 'bookshelf', variant: 'front', col: 16, row: 18, w: 2, h: 1, blocking: true });
  addFurniture(b, { id: 'ops-small-table', kind: 'small_table', variant: 'side', col: 20, row: 21, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'ops-bench', kind: 'cushioned_bench', variant: 'front', col: 18, row: 22, w: 1, h: 1, blocking: true });
}

function buildGardenAtrium(b: Builder): void {
  addFurniture(b, { id: 'garden-bed-north', kind: 'garden_bed', variant: 'front', col: 25, row: 19, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'garden-bed-south', kind: 'garden_bed', variant: 'front', col: 34, row: 23, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'garden-fountain-tower', kind: 'fountain_tower', variant: 'front', col: 30, row: 20, w: 3, h: 3, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'garden-bench-west', kind: 'cushioned_bench', variant: 'front', col: 25, row: 23, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: 'garden-bench-east', kind: 'cushioned_bench', variant: 'front', col: 37, row: 20, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: 'garden-large-plant-0', kind: 'large_plant', variant: 'front', col: 24, row: 22, w: 2, h: 2, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'garden-large-plant-1', kind: 'large_plant', variant: 'front', col: 37, row: 23, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'garden-cactus', kind: 'cactus', variant: 'front', col: 37, row: 18, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
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
  buildOpenOffice(b);
  buildMeetingSuite(b);
  buildCafeLounge(b);
  buildReceptionAndOps(b);
  buildGardenAtrium(b);

  return { cols: COLS, rows: ROWS, tiles, floorVariants, furniture: b.furniture, seats: b.seats, blocked: b.blocked, rooms: [...ROOM_ZONES], activities: officeActivities(b) };
}

export interface MeetingSpot { col: number; row: number; }

function isWalkable(layout: OfficeLayout, spot: MeetingSpot): boolean {
  return spot.col > 0 && spot.col < layout.cols - 1 && spot.row > 0 && spot.row < layout.rows - 1 && !layout.blocked.has(`${spot.col},${spot.row}`) && layout.tiles[spot.row][spot.col] !== TileType.WALL && layout.tiles[spot.row][spot.col] !== TileType.VOID;
}

function fallbackSpot(layout: OfficeLayout): MeetingSpot {
  return { col: 18, row: 15 };
}

export function meetingSpotFor(layout: OfficeLayout, index: number): MeetingSpot {
  const spots: MeetingSpot[] = [
    { col: 30, row: 6 }, { col: 31, row: 6 }, { col: 32, row: 6 },
    { col: 29, row: 5 }, { col: 33, row: 5 }, { col: 29, row: 6 }, { col: 33, row: 6 },
  ];
  const ok = spots.filter((spot) => isWalkable(layout, spot));
  return ok.length === 0 ? fallbackSpot(layout) : ok[index % ok.length];
}

function officeActivities(layout: Pick<OfficeLayout, 'cols' | 'rows' | 'tiles' | 'blocked'>): OfficeActivityDestination[] {
  const candidates: OfficeActivityDestination[] = [
    { id: 'whiteboard-review', label: 'Review board', col: 29, row: 2, facingDir: Direction.UP, state: CharacterState.READ, durationSec: 3.8 },
    { id: 'ops-console', label: 'Check console', col: 21, row: 13, facingDir: Direction.UP, state: CharacterState.TYPE, durationSec: 3.5 },
    { id: 'front-desk', label: 'Sort mail', col: 10, row: 20, facingDir: Direction.RIGHT, state: CharacterState.READ, durationSec: 3.0 },
    { id: 'coffee-maker', label: 'Pour coffee', col: 35, row: 13, facingDir: Direction.RIGHT, state: CharacterState.COFFEE, durationSec: 2.8 },
    { id: 'wash-station', label: 'Wash hands', col: 35, row: 16, facingDir: Direction.RIGHT, state: CharacterState.WASH, durationSec: 3.0 },
    { id: 'garden-fountain', label: 'Visit fountain', col: 31, row: 19, facingDir: Direction.DOWN, state: CharacterState.IDLE, durationSec: 3.2 },
    { id: 'garden-read', label: 'Read in garden', col: 26, row: 22, facingDir: Direction.DOWN, state: CharacterState.READ, durationSec: 3.6 },
    { id: 'lounge-read', label: 'Read brief', col: 28, row: 16, facingDir: Direction.UP, state: CharacterState.READ, durationSec: 3.6 },
  ];
  return candidates.filter((activity) => isWalkable(layout as OfficeLayout, activity));
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
