/**
 * Workshop office layout - Gather-style social office plaza with a central
 * courtyard, themed work islands, and an outdoor cafe terrace.
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
  { id: 'north-workshop', label: 'North Workshop', minCol: 1, maxCol: 19, minRow: 1, maxRow: 10, floorVariant: 0 },
  { id: 'west-open-office', label: 'West Open Office', minCol: 1, maxCol: 19, minRow: 11, maxRow: 24, floorVariant: 0 },
  { id: 'central-garden', label: 'Central Garden', minCol: 20, maxCol: 31, minRow: 8, maxRow: 22, floorVariant: 0 },
  { id: 'east-studio', label: 'East Studio', minCol: 32, maxCol: 50, minRow: 1, maxRow: 10, floorVariant: 0 },
  { id: 'meeting-lounge', label: 'Meeting Lounge', minCol: 32, maxCol: 50, minRow: 11, maxRow: 22, floorVariant: 0 },
  { id: 'garden-cafe', label: 'Garden Cafe', minCol: 32, maxCol: 50, minRow: 23, maxRow: 32, floorVariant: 0 },
  { id: 'reception', label: 'Reception', minCol: 1, maxCol: 18, minRow: 25, maxRow: 32, floorVariant: 0 },
  { id: 'south-spine', label: 'South Spine', minCol: 19, maxCol: 31, minRow: 23, maxRow: 32, floorVariant: 0 },
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
  if (col >= 20 && col <= 31 && row >= 8 && row <= 22) {
    // The garden is an indoor courtyard, not grass glued directly to desks.
    // A stone ring creates a transition from plaza floor -> paving -> grass.
    const isStoneRing = col <= 22 || col >= 29 || row <= 9 || row >= 21;
    return isStoneRing ? 8 : 4;
  }
  if (col >= 19 && col <= 31 && row >= 23 && row <= 25) return 8;
  if (col >= 38 && col <= 43 && row >= 14 && row <= 17) return 3;
  if ((col >= 34 && col <= 39 && row >= 25 && row <= 29) || (col >= 43 && col <= 48 && row >= 27 && row <= 31)) return 7;
  for (const zone of ROOM_ZONES) {
    if (isInsideRoom(zone, col, row)) return zone.floorVariant;
  }
  return 0;
}

function isWall(col: number, row: number): boolean {
  if (row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1) return true;

  // Interior glass/wall runs create readable rooms while keeping wide doors.
  if (row === 11 && col >= 1 && col <= 19 && ![8, 9, 10].includes(col)) return true;
  if (row === 11 && col >= 32 && col <= 50 && ![41, 42, 43].includes(col)) return true;
  if (row === 23 && col >= 1 && col <= 18 && ![9, 10, 17, 18].includes(col)) return true;
  // Includes a doorway at col 32 so the south spine connects to the outdoor
  // garden cafe without having to detour through the meeting lounge.
  if (row === 23 && col >= 32 && col <= 50 && ![32, 33, 40, 41, 42, 43].includes(col)) return true;
  if (col === 20 && row >= 1 && row <= 7 && ![5, 6].includes(row)) return true;
  if (col === 31 && row >= 1 && row <= 7 && ![5, 6].includes(row)) return true;
  if (col === 32 && row >= 12 && row <= 22 && ![15, 16, 21, 22].includes(row)) return true;
  if (col === 19 && row >= 25 && row <= 32 && ![28, 29].includes(row)) return true;
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

function buildWorkNeighborhoods(b: Builder): void {
  for (const col of [2, 6, 10, 14]) addTopDesk(b, col, 3);
  for (const col of [2, 6, 10, 14]) addBottomDesk(b, col, 19);
  for (const row of [13, 17, 21]) addSideDesk(b, 18, row, Direction.RIGHT);
  for (const row of [2, 6]) addSideDesk(b, 49, row, Direction.LEFT);
  for (const col of [35, 39, 43]) addTopDesk(b, col, 4);

  addFurniture(b, { id: 'north-status-wall', kind: 'status_wall', variant: 'front', col: 5, row: 1, w: 3, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'north-shelf', kind: 'double_bookshelf', variant: 'front', col: 16, row: 1, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'east-review-terminal', kind: 'review_terminal', variant: 'front', col: 45, row: 8, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'west-printer-table', kind: 'small_table', variant: 'side', col: 2, row: 13, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'west-large-plant', kind: 'large_plant', variant: 'front', col: 2, row: 21, w: 2, h: 2, spriteOverhangRows: 1, blocking: true });
}

function buildCentralGarden(b: Builder): void {
  addFurniture(b, { id: 'central-garden-bed-north', kind: 'garden_bed', variant: 'front', col: 22, row: 9, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'central-garden-bed-south', kind: 'garden_bed', variant: 'front', col: 27, row: 21, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'central-fountain-tower', kind: 'fountain_tower', variant: 'front', col: 24, row: 14, w: 3, h: 3, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'central-tree-west', kind: 'large_plant', variant: 'front', col: 20, row: 18, w: 2, h: 2, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'central-tree-east', kind: 'large_plant', variant: 'front', col: 30, row: 11, w: 1, h: 2, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'central-bench-west', kind: 'cushioned_bench', variant: 'front', col: 21, row: 13, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: 'central-bench-east', kind: 'cushioned_bench', variant: 'front', col: 29, row: 18, w: 1, h: 1, blocking: true });
}

function buildMeetingAndCafe(b: Builder): void {
  const tableCol = 39;
  const tableRow = 15;
  addFurniture(b, { id: 'meeting-table', kind: 'table', variant: 'front', col: tableCol, row: tableRow, w: 3, h: 1, blocking: true });
  pushBlocked(b, tableCol, tableRow - 1, 3, 1);
  addFurniture(b, { id: 'meeting-whiteboard', kind: 'whiteboard', variant: 'front', col: 36, row: 12, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'meeting-queue-board', kind: 'queue_board', variant: 'front', col: 42, row: 12, w: 3, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'meeting-sofa', kind: 'sofa', variant: 'front', col: 34, row: 20, w: 2, h: 1, blocking: true });
  addFurniture(b, { id: 'meeting-coffee-maker', kind: 'coffee', variant: 'front', col: 48, row: 19, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'meeting-wash-counter', kind: 'small_table', variant: 'front', col: 48, row: 21, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });

  addCafeSet(b, 'terrace-cafe-west', 35, 26);
  addCafeSet(b, 'terrace-cafe-east', 44, 28);
  addFurniture(b, { id: 'terrace-coffee-cart', kind: 'coffee', variant: 'front', col: 48, row: 24, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'terrace-garden-bed', kind: 'garden_bed', variant: 'front', col: 35, row: 31, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'terrace-large-plant', kind: 'large_plant', variant: 'front', col: 49, row: 31, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
}

function buildReceptionAndSouthSpine(b: Builder): void {
  addBottomDesk(b, 4, 29);
  addFurniture(b, { id: 'reception-painting', kind: 'large_painting', variant: 'front', col: 5, row: 25, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'reception-bench-0', kind: 'cushioned_bench', variant: 'front', col: 12, row: 29, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: 'reception-bench-1', kind: 'cushioned_bench', variant: 'front', col: 13, row: 29, w: 1, h: 1, blocking: true });
  addFurniture(b, { id: 'reception-plant', kind: 'large_plant', variant: 'front', col: 2, row: 30, w: 2, h: 2, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'south-clock', kind: 'clock', variant: 'front', col: 24, row: 24, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'south-bookshelf', kind: 'bookshelf', variant: 'front', col: 21, row: 30, w: 2, h: 1, blocking: true });
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
  buildWorkNeighborhoods(b);
  buildCentralGarden(b);
  buildMeetingAndCafe(b);
  buildReceptionAndSouthSpine(b);

  return { cols: COLS, rows: ROWS, tiles, floorVariants, furniture: b.furniture, seats: b.seats, blocked: b.blocked, rooms: [...ROOM_ZONES], activities: officeActivities(b) };
}

export interface MeetingSpot { col: number; row: number; }

function isWalkable(layout: OfficeLayout, spot: MeetingSpot): boolean {
  return spot.col > 0 && spot.col < layout.cols - 1 && spot.row > 0 && spot.row < layout.rows - 1 && !layout.blocked.has(`${spot.col},${spot.row}`) && layout.tiles[spot.row][spot.col] !== TileType.WALL && layout.tiles[spot.row][spot.col] !== TileType.VOID;
}

function fallbackSpot(_layout: OfficeLayout): MeetingSpot {
  return { col: 25, row: 18 };
}

export function meetingSpotFor(layout: OfficeLayout, index: number): MeetingSpot {
  const spots: MeetingSpot[] = [
    { col: 39, row: 16 }, { col: 40, row: 16 }, { col: 41, row: 16 },
    { col: 38, row: 15 }, { col: 42, row: 15 }, { col: 38, row: 16 }, { col: 42, row: 16 },
  ];
  const ok = spots.filter((spot) => isWalkable(layout, spot));
  return ok.length === 0 ? fallbackSpot(layout) : ok[index % ok.length];
}

function officeActivities(layout: Pick<OfficeLayout, 'cols' | 'rows' | 'tiles' | 'blocked'>): OfficeActivityDestination[] {
  const candidates: OfficeActivityDestination[] = [
    { id: 'central-fountain', label: 'Visit fountain', col: 23, row: 15, facingDir: Direction.RIGHT, state: CharacterState.IDLE, durationSec: 3.4 },
    { id: 'central-garden-read', label: 'Read in garden', col: 28, row: 20, facingDir: Direction.DOWN, state: CharacterState.READ, durationSec: 3.8 },
    { id: 'terrace-coffee', label: 'Coffee outside', col: 47, row: 24, facingDir: Direction.RIGHT, state: CharacterState.COFFEE, durationSec: 3.0 },
    { id: 'terrace-table-chat', label: 'Cafe table', col: 37, row: 26, facingDir: Direction.LEFT, state: CharacterState.COFFEE, durationSec: 3.2 },
    { id: 'whiteboard-review', label: 'Review board', col: 37, row: 13, facingDir: Direction.UP, state: CharacterState.READ, durationSec: 3.8 },
    { id: 'ops-console', label: 'Check console', col: 45, row: 10, facingDir: Direction.UP, state: CharacterState.TYPE, durationSec: 3.5 },
    { id: 'coffee-maker', label: 'Pour coffee', col: 47, row: 19, facingDir: Direction.RIGHT, state: CharacterState.COFFEE, durationSec: 2.8 },
    { id: 'wash-station', label: 'Wash hands', col: 47, row: 21, facingDir: Direction.RIGHT, state: CharacterState.WASH, durationSec: 3.0 },
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
