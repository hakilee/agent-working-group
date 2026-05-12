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

export type FurnitureKind = 'desk' | 'pc' | 'chair' | 'table';
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

export interface OfficeLayout {
  cols: number;
  rows: number;
  tiles: TileType[][];
  furniture: FurnitureInstance[];
  seats: Seat[];
  /** Set of "col,row" strings that block walking (from furniture footprints) */
  blocked: Set<string>;
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
  desk: { front: HTMLImageElement | null };
  pc: { front: HTMLImageElement | null; back: HTMLImageElement | null };
  chair: { front: HTMLImageElement | null; back: HTMLImageElement | null };
  table: { front: HTMLImageElement | null };
}

export interface SpriteManager {
  characters: SpriteSheet[];
  furniture: FurnitureSprites;
  floor: HTMLImageElement | null;
  wall: HTMLImageElement | null;
  /** Frame size for character sprites in pixels */
  charFrameW: number;
  charFrameH: number;
}
