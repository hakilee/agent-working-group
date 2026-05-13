import type { AgentProfile, RoomState } from '../types';

export const TILE_SIZE = 16;

export const TileType = {
  FLOOR: 0,
  WALL: 1,
  VOID: 2,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

export const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const CharacterState = {
  IDLE: 'idle',
  WALK: 'walk',
  TYPE: 'type',
  READ: 'read',
} as const;
export type CharacterState = (typeof CharacterState)[keyof typeof CharacterState];

export type FurnitureKind =
  | 'desk'
  | 'pc'
  | 'chair'
  | 'table'
  | 'whiteboard'
  | 'bookshelf'
  | 'double_bookshelf'
  | 'plant'
  | 'large_plant'
  | 'hanging_plant'
  | 'cactus'
  | 'sofa'
  | 'coffee_table'
  | 'coffee'
  | 'bin'
  | 'cushioned_bench'
  | 'small_table'
  | 'clock'
  | 'small_painting'
  | 'large_painting'
  | 'queue_board'
  | 'status_wall'
  | 'review_terminal';
export type FurnitureVariant = 'front' | 'back' | 'side' | 'side-mirror';

export interface FurnitureInstance {
  id: string;
  kind: FurnitureKind;
  variant: FurnitureVariant;
  /** Top-left tile col */
  col: number;
  /** Top-left tile row */
  row: number;
  /** Footprint width in tiles (drawn sprite width = w * TILE_SIZE) */
  w: number;
  /** Footprint height in tiles (drawn sprite height = h * TILE_SIZE) */
  h: number;
  /** Tiles above the footprint row that the sprite visually extends into (0 = no extension) */
  spriteOverhangRows?: number;
  /** Whether this furniture blocks walking on its footprint */
  blocking: boolean;
  /** For PCs: optional animated state */
  animated?: boolean;
}

export interface Seat {
  id: string;
  col: number;
  row: number;
  /** Direction the character faces when sitting (toward the desk) */
  facingDir: Direction;
  /** Role assigned to this seat, or null if free */
  assignedRole: string | null;
  /** Kind of seat: desk for working, meeting for gathering */
  kind: 'desk' | 'meeting';
}

export interface RoomZone {
  id: string;
  label: string;
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
  /** Index into SpriteManager.floor[] used to tile this zone's floor. */
  floorVariant: number;
}

export interface OfficeActivityDestination {
  id: string;
  label: string;
  col: number;
  row: number;
  facingDir: Direction;
  state: CharacterState;
  durationSec: number;
}

export interface OfficeLayout {
  cols: number;
  rows: number;
  tiles: TileType[][];
  furniture: FurnitureInstance[];
  seats: Seat[];
  /** Set of "col,row" strings that block walking (from furniture footprints) */
  blocked: Set<string>;
  /** Logical room zones (for floor styling, future labels, debugging). */
  rooms: RoomZone[];
  /** Per-tile floor variant index. Walls and out-of-room aisles default to 0. */
  floorVariants: number[][];
  /** Intentful destinations used for ambient office errands. */
  activities: OfficeActivityDestination[];
}

export interface TaskPulse {
  id: string;
  kind: 'handoff' | 'complete';
  fromRole: string | null;
  toRole: string;
  startedAt: number;
  durationMs: number;
}

export interface EngineCharacter {
  id: string;
  role: string;
  profile: AgentProfile;
  palette: number;
  state: CharacterState;
  dir: Direction;
  /** Pixel x of sprite top-left (smoothly interpolated) */
  x: number;
  /** Pixel y of sprite top-left (smoothly interpolated) */
  y: number;
  /** Current tile col */
  tileCol: number;
  /** Current tile row */
  tileRow: number;
  /** Remaining path steps (tile coords, excluding current) */
  path: Array<{ col: number; row: number }>;
  /** Current route destination, used for rerouting around dynamic obstacles. */
  target: { col: number; row: number; allowBlockedEnd: boolean; activityId?: string | null } | null;
  /** Progress 0..1 lerp between current tile and next path tile */
  moveProgress: number;
  /** Animation frame index */
  frame: number;
  /** Time accumulator for animation */
  frameTimer: number;
  /** Assigned seat id, or null */
  seatId: string | null;
  /** Where the character wants to go ('seat', 'meeting', 'wander') */
  intent: 'seat' | 'meeting' | 'wander' | 'stay';
  /** Current AWG room state */
  roomState: RoomState;
  /** Office action being performed after arriving at an intentful destination. */
  currentActivity: OfficeActivityDestination | null;
  /** Remaining seconds for the current office action. */
  actionTimer: number;
  /** Timer for idle wandering decisions */
  wanderTimer: number;
  /** Timer for blocked flash (counts down 0..1 over flash period) */
  flashTimer: number;
  /** True when role state is blocked (dead items present) */
  isBlocked: boolean;
}

export interface SpriteSheet {
  /** Per-direction × frame source canvas */
  byDirFrame: HTMLCanvasElement[][];
}

export interface FurnitureSprites {
  desk: { front: HTMLImageElement | null; side: HTMLImageElement | null };
  pc: { front: HTMLImageElement | null; back: HTMLImageElement | null; side: HTMLImageElement | null };
  chair: { front: HTMLImageElement | null; back: HTMLImageElement | null; side: HTMLImageElement | null };
  table: { front: HTMLImageElement | null };
  whiteboard: HTMLImageElement | null;
  bookshelf: HTMLImageElement | null;
  doubleBookshelf: HTMLImageElement | null;
  plant: HTMLImageElement | null;
  largePlant: HTMLImageElement | null;
  hangingPlant: HTMLImageElement | null;
  cactus: HTMLImageElement | null;
  sofa: { front: HTMLImageElement | null; back: HTMLImageElement | null; side: HTMLImageElement | null };
  coffeeTable: HTMLImageElement | null;
  coffee: HTMLImageElement | null;
  bin: HTMLImageElement | null;
  cushionedBench: HTMLImageElement | null;
  smallTable: { front: HTMLImageElement | null; side: HTMLImageElement | null };
  clock: HTMLImageElement | null;
  smallPainting: HTMLImageElement | null;
  largePainting: HTMLImageElement | null;
}

export interface SpriteManager {
  characters: SpriteSheet[];
  furniture: FurnitureSprites;
  /** Floor tile variants, indexed by RoomZone.floorVariant. Always at least
   *  one entry; missing variants from disk fall back to floor[0]. */
  floor: (HTMLImageElement | null)[];
  wall: HTMLImageElement | null;
  /** Frame size for character sprites in pixels */
  charFrameW: number;
  charFrameH: number;
}
