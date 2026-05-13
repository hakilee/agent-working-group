/**
 * Workshop office layout - Gather startup-style workspace campus.
 *
 * The map is intentionally rebuilt from the ground up around the visual grammar
 * in Gather's startup-office examples: a broad pale-wood circulation spine,
 * compact rooms and desk neighborhoods attached to it, soft outdoor greenery,
 * glass/window bands, dense furniture clusters, and plants used as zoning.
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

const COLS = 78;
const ROWS = 46;
const DESK_WIDTH = 3;

const ROOM_ZONES: ReadonlyArray<RoomZone> = [
  { id: 'north-boardroom', label: 'Boardroom', minCol: 3, maxCol: 16, minRow: 2, maxRow: 13, floorVariant: 3 },
  { id: 'north-open-office', label: 'North Desks', minCol: 20, maxCol: 36, minRow: 3, maxRow: 14, floorVariant: 1 },
  { id: 'north-focus-suite', label: 'Focus Suite', minCol: 41, maxCol: 58, minRow: 3, maxRow: 14, floorVariant: 6 },
  { id: 'east-greenhouse', label: 'Greenhouse Office', minCol: 63, maxCol: 74, minRow: 9, maxRow: 24, floorVariant: 2 },
  { id: 'west-call-room', label: 'Call Room', minCol: 3, maxCol: 15, minRow: 17, maxRow: 29, floorVariant: 2 },
  { id: 'central-lounge', label: 'Social Lounge', minCol: 30, maxCol: 47, minRow: 17, maxRow: 29, floorVariant: 8 },
  { id: 'east-team-room', label: 'Team Room', minCol: 51, maxCol: 63, minRow: 17, maxRow: 31, floorVariant: 6 },
  { id: 'south-game-lounge', label: 'Game Lounge', minCol: 16, maxCol: 29, minRow: 31, maxRow: 41, floorVariant: 3 },
  { id: 'south-maker-lab', label: 'Maker Lab', minCol: 33, maxCol: 47, minRow: 32, maxRow: 43, floorVariant: 1 },
  { id: 'south-library', label: 'Library', minCol: 52, maxCol: 66, minRow: 34, maxRow: 43, floorVariant: 7 },
  { id: 'south-quiet-room', label: 'Quiet Room', minCol: 3, maxCol: 13, minRow: 33, maxRow: 43, floorVariant: 2 },
];

type DoorSide = 'top' | 'bottom' | 'left' | 'right';
type DoorSpec = { side: DoorSide; from: number; to: number };

const ROOM_DOORS: Record<string, ReadonlyArray<DoorSpec>> = {
  'north-boardroom': [{ side: 'right', from: 7, to: 10 }, { side: 'bottom', from: 8, to: 11 }],
  'north-open-office': [{ side: 'bottom', from: 26, to: 31 }, { side: 'right', from: 8, to: 11 }],
  'north-focus-suite': [{ side: 'bottom', from: 47, to: 52 }, { side: 'left', from: 7, to: 10 }],
  'east-greenhouse': [{ side: 'left', from: 14, to: 19 }],
  'west-call-room': [{ side: 'right', from: 21, to: 25 }],
  'central-lounge': [{ side: 'top', from: 36, to: 41 }, { side: 'bottom', from: 37, to: 42 }, { side: 'left', from: 22, to: 25 }, { side: 'right', from: 22, to: 25 }],
  'east-team-room': [{ side: 'left', from: 22, to: 26 }, { side: 'bottom', from: 56, to: 60 }],
  'south-game-lounge': [{ side: 'top', from: 20, to: 25 }],
  'south-maker-lab': [{ side: 'top', from: 38, to: 43 }, { side: 'left', from: 36, to: 39 }],
  'south-library': [{ side: 'top', from: 57, to: 61 }, { side: 'left', from: 37, to: 40 }],
  'south-quiet-room': [{ side: 'right', from: 37, to: 40 }],
};

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

function inRange(v: number, a: number, b: number): boolean {
  return v >= a && v <= b;
}

function isInsideRoom(zone: RoomZone, col: number, row: number): boolean {
  return col >= zone.minCol && col <= zone.maxCol && row >= zone.minRow && row <= zone.maxRow;
}

function isInMainSpine(col: number, row: number): boolean {
  return (
    (inRange(col, 11, 66) && inRange(row, 14, 34)) ||
    (inRange(col, 17, 62) && inRange(row, 8, 37)) ||
    (inRange(col, 23, 55) && inRange(row, 6, 39))
  );
}

function roomVariantAt(col: number, row: number): number {
  if (isInMainSpine(col, row)) return 0;
  for (const zone of ROOM_ZONES) {
    if (isInsideRoom(zone, col, row)) return zone.floorVariant;
  }
  // Outdoor field with softer clearings around building entrances.
  if ((inRange(col, 1, 10) || inRange(col, 68, 76)) && row % 7 < 4) return 4;
  return 4;
}

function hasDoor(zone: RoomZone, col: number, row: number): boolean {
  const doors = ROOM_DOORS[zone.id] ?? [];
  return doors.some((door) => {
    if (door.side === 'top' && row === zone.minRow) return inRange(col, door.from, door.to);
    if (door.side === 'bottom' && row === zone.maxRow) return inRange(col, door.from, door.to);
    if (door.side === 'left' && col === zone.minCol) return inRange(row, door.from, door.to);
    if (door.side === 'right' && col === zone.maxCol) return inRange(row, door.from, door.to);
    return false;
  });
}

function isWall(col: number, row: number): boolean {
  for (const zone of ROOM_ZONES) {
    if (!isInsideRoom(zone, col, row)) continue;
    const boundary = col === zone.minCol || col === zone.maxCol || row === zone.minRow || row === zone.maxRow;
    if (boundary && !hasDoor(zone, col, row)) return true;
  }

  // Startup-like partial glass/privacy partitions that create booths without
  // sealing off navigation.
  if (inRange(col, 21, 35) && row === 20 && !inRange(col, 26, 29)) return true;
  if (inRange(col, 21, 35) && row === 26 && !inRange(col, 27, 30)) return true;
  if (col === 40 && inRange(row, 18, 22)) return true;
  if (col === 55 && inRange(row, 18, 30) && !inRange(row, 22, 25)) return true;
  if (row === 26 && inRange(col, 56, 62) && !inRange(col, 58, 60)) return true;
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

function addGatherPlant(
  b: Builder,
  id: string,
  kind: 'potted_plant_round' | 'potted_plant_leafy' | 'potted_plant_tall' | 'hedge_planter',
  col: number,
  row: number,
  w = 1,
  h = 1,
): void {
  const overhang = kind === 'potted_plant_tall' || kind === 'hedge_planter' ? 1 : 0;
  addFurniture(b, { id, kind, variant: 'front', col, row, w, h, spriteOverhangRows: overhang, blocking: true });
}

function addBotanicalAccent(
  b: Builder,
  id: string,
  kind: 'flower_shrub' | 'floor_sprout' | 'desk_plant' | 'hanging_vine',
  col: number,
  row: number,
  w = 1,
  h = 1,
): void {
  const overhang = kind === 'hanging_vine' ? 1 : 0;
  addFurniture(b, { id, kind, variant: 'front', col, row, w, h, spriteOverhangRows: overhang, blocking: false }, false);
}

function addWindowBand(b: Builder, id: string, col: number, row: number, count: number): void {
  for (let i = 0; i < count; i++) {
    addFurniture(b, { id: `${id}-${i}`, kind: 'window_panel', variant: 'front', col: col + i * 2, row, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  }
}

function addWallArt(b: Builder, id: string, col: number, row: number, w = 3): void {
  addFurniture(b, { id, kind: 'wall_panel', variant: 'front', col, row, w, h: 1, spriteOverhangRows: 1, blocking: true });
}

function buildBoardroom(b: Builder): void {
  addWindowBand(b, 'boardroom-window', 5, 2, 3);
  addFurniture(b, { id: 'boardroom-table', kind: 'table', variant: 'front', col: 6, row: 7, w: 5, h: 2, blocking: true });
  for (const col of [6, 8, 10]) addFurniture(b, { id: `boardroom-chair-n-${col}`, kind: 'chair', variant: 'front', col, row: 6, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  for (const col of [6, 8, 10]) addFurniture(b, { id: `boardroom-chair-s-${col}`, kind: 'chair', variant: 'back', col, row: 9, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  addSeat(b, 6, 9, Direction.UP, 'meeting');
  addSeat(b, 8, 9, Direction.UP, 'meeting');
  addSeat(b, 10, 9, Direction.UP, 'meeting');
  addFurniture(b, { id: 'boardroom-clock', kind: 'clock', variant: 'front', col: 13, row: 4, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addGatherPlant(b, 'boardroom-tall-plant', 'potted_plant_tall', 4, 10);
  addBotanicalAccent(b, 'boardroom-desk-plant', 'desk_plant', 9, 6);
}

function buildNorthOpenOffice(b: Builder): void {
  addWindowBand(b, 'north-office-window', 22, 3, 5);
  for (const col of [22, 27, 32]) addTopDesk(b, col, 8);
  for (const col of [22, 27, 32]) addBottomDesk(b, col, 12);
  addFurniture(b, { id: 'north-office-bookshelf', kind: 'double_bookshelf', variant: 'front', col: 20, row: 4, w: 2, h: 2, blocking: true });
  addWallArt(b, 'north-office-board', 30, 4, 4);
  addGatherPlant(b, 'north-office-hedge', 'hedge_planter', 21, 13, 3, 1);
  addBotanicalAccent(b, 'north-office-floor-sprout', 'floor_sprout', 35, 7);
  addBotanicalAccent(b, 'north-office-desk-plant', 'desk_plant', 28, 7);
}

function buildNorthFocusSuite(b: Builder): void {
  addWindowBand(b, 'focus-window', 43, 3, 6);
  addTopDesk(b, 43, 8);
  addTopDesk(b, 49, 8);
  addSideDesk(b, 56, 8, Direction.LEFT);
  addFurniture(b, { id: 'focus-whiteboard', kind: 'whiteboard', variant: 'front', col: 43, row: 4, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'focus-lockers', kind: 'tool_cabinet', variant: 'front', col: 55, row: 4, w: 2, h: 2, blocking: true });
  addGatherPlant(b, 'focus-tall-plant', 'potted_plant_tall', 42, 11);
  addGatherPlant(b, 'focus-round-plant', 'potted_plant_round', 57, 11);
  addBotanicalAccent(b, 'focus-hanging-vine', 'hanging_vine', 51, 3);
  addBotanicalAccent(b, 'focus-desk-plant', 'desk_plant', 50, 7);
}

function buildEastGreenhouse(b: Builder): void {
  addWindowBand(b, 'greenhouse-window', 64, 9, 4);
  addFurniture(b, { id: 'greenhouse-aquarium', kind: 'review_terminal', variant: 'front', col: 64, row: 12, w: 2, h: 2, blocking: true });
  addCafeSet(b, 'greenhouse-chat-a', 67, 17);
  addCafeSet(b, 'greenhouse-chat-b', 70, 21);
  addGatherPlant(b, 'greenhouse-hedge-n', 'hedge_planter', 66, 14, 3, 1);
  addGatherPlant(b, 'greenhouse-hedge-s', 'hedge_planter', 68, 24, 4, 1);
  addFurniture(b, { id: 'greenhouse-garden-bed', kind: 'garden_bed', variant: 'front', col: 64, row: 23, w: 3, h: 1, blocking: true });
  addGatherPlant(b, 'greenhouse-tall-east', 'potted_plant_tall', 73, 12);
  addBotanicalAccent(b, 'greenhouse-flower-a', 'flower_shrub', 65, 20);
  addBotanicalAccent(b, 'greenhouse-flower-b', 'flower_shrub', 72, 18);
  addBotanicalAccent(b, 'greenhouse-sprout', 'floor_sprout', 64, 23);
}

function buildWestCallRoom(b: Builder): void {
  addWindowBand(b, 'call-window', 4, 17, 3);
  addCafeSet(b, 'call-chat', 7, 23);
  addFurniture(b, { id: 'call-console', kind: 'review_terminal', variant: 'front', col: 4, row: 19, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'call-bookshelf', kind: 'bookshelf', variant: 'front', col: 13, row: 27, w: 1, h: 2, blocking: true });
  addGatherPlant(b, 'call-leafy-plant', 'potted_plant_leafy', 12, 20);
  addBotanicalAccent(b, 'call-floor-sprout', 'floor_sprout', 10, 27);
}

function buildCentralLounge(b: Builder): void {
  addFurniture(b, { id: 'lounge-bookshelf-west', kind: 'double_bookshelf', variant: 'front', col: 31, row: 18, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'lounge-bookshelf-east', kind: 'double_bookshelf', variant: 'front', col: 44, row: 18, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'lounge-sofa-n', kind: 'sofa', variant: 'front', col: 35, row: 22, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'lounge-sofa-s', kind: 'sofa', variant: 'front', col: 39, row: 26, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'lounge-table', kind: 'coffee_table', variant: 'front', col: 38, row: 24, w: 2, h: 1, blocking: true });
  addGatherPlant(b, 'lounge-tall-plant', 'potted_plant_tall', 32, 25);
  addGatherPlant(b, 'lounge-round-plant', 'potted_plant_round', 45, 25);
  addFurniture(b, { id: 'lounge-plaza-planter', kind: 'plaza_planter', variant: 'front', col: 37, row: 20, w: 3, h: 2, spriteOverhangRows: 1, blocking: true });
  addBotanicalAccent(b, 'lounge-flower-nw', 'flower_shrub', 34, 20);
  addBotanicalAccent(b, 'lounge-flower-se', 'flower_shrub', 43, 27);
  addBotanicalAccent(b, 'lounge-desk-plant', 'desk_plant', 39, 23);
  addSeat(b, 36, 23, Direction.DOWN, 'meeting');
  addSeat(b, 40, 25, Direction.UP, 'meeting');
}

function buildEastTeamRoom(b: Builder): void {
  addWindowBand(b, 'team-window', 53, 17, 4);
  for (const col of [53, 58]) addTopDesk(b, col, 21);
  for (const col of [53, 58]) addBottomDesk(b, col, 29);
  addFurniture(b, { id: 'team-whiteboard', kind: 'whiteboard', variant: 'front', col: 57, row: 18, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'team-coffee-maker', kind: 'coffee', variant: 'front', col: 62, row: 21, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'team-wash-station', kind: 'small_table', variant: 'front', col: 62, row: 27, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addGatherPlant(b, 'team-plant', 'potted_plant_leafy', 52, 30);
  addBotanicalAccent(b, 'team-desk-plant', 'desk_plant', 59, 20);
  addBotanicalAccent(b, 'team-floor-sprout', 'floor_sprout', 61, 25);
}

function buildSouthGameLounge(b: Builder): void {
  addFurniture(b, { id: 'game-ping-table', kind: 'table', variant: 'front', col: 19, row: 35, w: 5, h: 2, blocking: true });
  addFurniture(b, { id: 'game-sofa', kind: 'sofa', variant: 'front', col: 24, row: 39, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'game-cabinet', kind: 'tool_cabinet', variant: 'front', col: 17, row: 32, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'game-screen', kind: 'review_terminal', variant: 'front', col: 26, row: 33, w: 2, h: 2, blocking: true });
  addGatherPlant(b, 'game-plant-a', 'potted_plant_round', 17, 39);
  addGatherPlant(b, 'game-plant-b', 'potted_plant_leafy', 27, 37);
  addBotanicalAccent(b, 'game-flower', 'flower_shrub', 22, 40);
}

function buildSouthMakerLab(b: Builder): void {
  addWallArt(b, 'maker-wall-board', 36, 32, 4);
  addFurniture(b, { id: 'maker-bench-a', kind: 'maker_bench', variant: 'front', col: 35, row: 36, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'maker-bench-b', kind: 'maker_bench', variant: 'front', col: 42, row: 36, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'maker-parts', kind: 'parts_shelf', variant: 'front', col: 34, row: 40, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'maker-tools', kind: 'tool_cabinet', variant: 'front', col: 44, row: 40, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'maker-spool', kind: 'cable_spool', variant: 'front', col: 40, row: 41, w: 2, h: 1, blocking: true });
  addGatherPlant(b, 'maker-hedge', 'hedge_planter', 37, 42, 4, 1);
  addBotanicalAccent(b, 'maker-hanging-vine', 'hanging_vine', 44, 32);
}

function buildSouthLibrary(b: Builder): void {
  addFurniture(b, { id: 'library-shelf-a', kind: 'double_bookshelf', variant: 'front', col: 53, row: 35, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'library-shelf-b', kind: 'double_bookshelf', variant: 'front', col: 59, row: 35, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'library-table', kind: 'coffee_table', variant: 'front', col: 57, row: 40, w: 3, h: 1, blocking: true });
  addFurniture(b, { id: 'library-chair-a', kind: 'chair', variant: 'front', col: 56, row: 39, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  addFurniture(b, { id: 'library-chair-b', kind: 'chair', variant: 'back', col: 60, row: 41, w: 1, h: 1, spriteOverhangRows: 1, blocking: false }, false);
  addGatherPlant(b, 'library-tall-plant', 'potted_plant_tall', 64, 36);
  addGatherPlant(b, 'library-leafy-plant', 'potted_plant_leafy', 52, 41);
  addBotanicalAccent(b, 'library-desk-plant', 'desk_plant', 58, 39);
}

function buildSouthQuietRoom(b: Builder): void {
  addWindowBand(b, 'quiet-window', 4, 33, 3);
  addCafeSet(b, 'quiet-roundtable', 7, 39);
  addFurniture(b, { id: 'quiet-bookshelf', kind: 'bookshelf', variant: 'front', col: 4, row: 35, w: 1, h: 2, blocking: true });
  addGatherPlant(b, 'quiet-round-plant', 'potted_plant_round', 11, 36);
  addBotanicalAccent(b, 'quiet-flower', 'flower_shrub', 5, 41);
}

function buildOutdoorCampus(b: Builder): void {
  const treeSpots = [
    [2, 5], [72, 3], [5, 15], [70, 28], [2, 40], [74, 39], [18, 2], [61, 2], [68, 5], [12, 31], [69, 33], [25, 43],
  ];
  for (const [i, [col, row]] of treeSpots.entries()) {
    addFurniture(b, { id: `outdoor-tree-${i}`, kind: 'large_plant', variant: 'front', col, row, w: 2, h: 2, spriteOverhangRows: 1, blocking: true });
  }
  for (const [i, [col, row]] of [[11, 7], [64, 7], [70, 14], [9, 31], [31, 42], [72, 25]].entries()) {
    addBotanicalAccent(b, `outdoor-flower-${i}`, 'flower_shrub', col, row);
  }
  for (const [i, [col, row]] of [[23, 16], [27, 16], [49, 16], [48, 31], [30, 30], [65, 31]].entries()) {
    addGatherPlant(b, `corridor-planter-${i}`, i % 2 ? 'potted_plant_leafy' : 'potted_plant_round', col, row);
  }
  addWallArt(b, 'main-hall-signage-west', 17, 14, 3);
  addWallArt(b, 'main-hall-signage-east', 49, 14, 3);
  addFurniture(b, { id: 'main-hall-aquarium', kind: 'review_terminal', variant: 'front', col: 12, row: 14, w: 2, h: 2, blocking: true });
  addFurniture(b, { id: 'main-hall-map', kind: 'whiteboard', variant: 'front', col: 60, row: 14, w: 2, h: 1, spriteOverhangRows: 1, blocking: true });
  addFurniture(b, { id: 'main-hall-clock', kind: 'clock', variant: 'front', col: 39, row: 14, w: 1, h: 1, spriteOverhangRows: 1, blocking: true });
  addGatherPlant(b, 'main-hall-hedge-west', 'hedge_planter', 17, 31, 4, 1);
  addGatherPlant(b, 'main-hall-hedge-east', 'hedge_planter', 48, 32, 4, 1);
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
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (tiles[r][c] === TileType.WALL) blockTile(b, c, r);

  buildOutdoorCampus(b);
  buildBoardroom(b);
  buildNorthOpenOffice(b);
  buildNorthFocusSuite(b);
  buildEastGreenhouse(b);
  buildWestCallRoom(b);
  buildCentralLounge(b);
  buildEastTeamRoom(b);
  buildSouthGameLounge(b);
  buildSouthMakerLab(b);
  buildSouthLibrary(b);
  buildSouthQuietRoom(b);

  return { cols: COLS, rows: ROWS, tiles, floorVariants, furniture: b.furniture, seats: b.seats, blocked: b.blocked, rooms: [...ROOM_ZONES], activities: officeActivities(b) };
}

export interface MeetingSpot { col: number; row: number; }

function isWalkable(layout: OfficeLayout, spot: MeetingSpot): boolean {
  return spot.col > 0 && spot.col < layout.cols - 1 && spot.row > 0 && spot.row < layout.rows - 1 && !layout.blocked.has(`${spot.col},${spot.row}`) && layout.tiles[spot.row][spot.col] !== TileType.WALL && layout.tiles[spot.row][spot.col] !== TileType.VOID;
}

function fallbackSpot(_layout: OfficeLayout): MeetingSpot {
  return { col: 39, row: 23 };
}

export function meetingSpotFor(layout: OfficeLayout, index: number): MeetingSpot {
  const spots: MeetingSpot[] = [
    { col: 36, row: 23 }, { col: 40, row: 25 }, { col: 38, row: 24 },
    { col: 7, row: 9 }, { col: 8, row: 9 }, { col: 10, row: 9 },
  ];
  const ok = spots.filter((spot) => isWalkable(layout, spot));
  return ok.length === 0 ? fallbackSpot(layout) : ok[Math.abs(index) % ok.length];
}

function officeActivities(layout: Pick<OfficeLayout, 'cols' | 'rows' | 'tiles' | 'blocked'>): OfficeActivityDestination[] {
  const candidates: OfficeActivityDestination[] = [
    { id: 'lounge-read', label: 'Read in lounge', col: 35, row: 23, facingDir: Direction.DOWN, state: CharacterState.READ, durationSec: 3.8 },
    { id: 'greenhouse-coffee', label: 'Greenhouse coffee', col: 67, row: 17, facingDir: Direction.LEFT, state: CharacterState.COFFEE, durationSec: 3.0 },
    { id: 'team-coffee-maker', label: 'Team coffee maker', col: 61, row: 21, facingDir: Direction.RIGHT, state: CharacterState.COFFEE, durationSec: 2.8 },
    { id: 'team-wash-station', label: 'Team wash station', col: 61, row: 27, facingDir: Direction.RIGHT, state: CharacterState.WASH, durationSec: 2.8 },
    { id: 'north-review-board', label: 'Review board', col: 31, row: 5, facingDir: Direction.UP, state: CharacterState.READ, durationSec: 3.8 },
    { id: 'maker-bench', label: 'Maker bench', col: 39, row: 36, facingDir: Direction.UP, state: CharacterState.TYPE, durationSec: 4.2 },
    { id: 'main-hall-map', label: 'Campus map', col: 60, row: 15, facingDir: Direction.UP, state: CharacterState.READ, durationSec: 3.0 },
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
