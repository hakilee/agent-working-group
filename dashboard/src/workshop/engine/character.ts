import type { AgentRoom, RoomState } from '../types';
import { ambientErrandSpotFor, meetingSpotFor, officeActivityFor, wanderSpotFor } from './office-layout';
import { findPath, tileKey } from './pathfinding';
import {
  CharacterState,
  Direction,
  TILE_SIZE,
  type CharacterState as CState,
  type Direction as Dir,
  type EngineCharacter,
  type OfficeActivityDestination,
  type OfficeLayout,
  type Seat,
} from './types';

const WALK_SPEED_TILES_PER_SEC = 3.2;
const WALK_FRAME_INTERVAL = 0.16;
const TYPE_FRAME_INTERVAL = 0.45;
const READ_FRAME_INTERVAL = 0.6;
const WANDER_INTERVAL_MIN = 4;
const WANDER_INTERVAL_MAX = 9;
const IDLE_ERRAND_CHANCE = 0.35;
const RESTORED_DECISION_DELAY = 2.2;
const RESTORED_DECISION_JITTER = 1.2;
const ROLE_MOVE_PRIORITY: Record<string, number> = { lead: 0, worker: 1 };
const COLLISION_WAIT_MIN = 0.35;
const COLLISION_WAIT_MAX = 1.1;

function restoredDecisionDelay(): number {
  return RESTORED_DECISION_DELAY + Math.random() * RESTORED_DECISION_JITTER;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Persisted state shape used to bootstrap or restore a character without
 * flashing a default direction or replaying old movement. All fields are
 * optional — missing fields fall back to `spawn` defaults.
 */
export interface CharacterRestore {
  x?: number;
  y?: number;
  tileCol?: number;
  tileRow?: number;
  dir?: Dir;
  state?: CState;
}

/** Coerce an unknown `dir`/`state` payload to a safe engine value. */
function coerceDir(value: unknown): Dir | undefined {
  if (value === Direction.DOWN || value === Direction.LEFT || value === Direction.RIGHT || value === Direction.UP) {
    return value;
  }
  return undefined;
}

function coerceState(value: unknown): CState | undefined {
  if (
    value === CharacterState.IDLE ||
    value === CharacterState.WALK ||
    value === CharacterState.TYPE ||
    value === CharacterState.READ
  ) {
    return value;
  }
  return undefined;
}

/** Sanitize an arbitrary persisted payload into a CharacterRestore. */
export function sanitizeRestore(raw: unknown): CharacterRestore | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: CharacterRestore = {};
  if (typeof r.x === 'number' && Number.isFinite(r.x)) out.x = r.x;
  if (typeof r.y === 'number' && Number.isFinite(r.y)) out.y = r.y;
  if (typeof r.tileCol === 'number' && Number.isFinite(r.tileCol)) out.tileCol = Math.trunc(r.tileCol);
  if (typeof r.tileRow === 'number' && Number.isFinite(r.tileRow)) out.tileRow = Math.trunc(r.tileRow);
  const d = coerceDir(r.dir);
  if (d !== undefined) out.dir = d;
  const s = coerceState(r.state);
  if (s !== undefined) out.state = s;
  return out;
}

export function createCharacter(
  room: AgentRoom,
  paletteCount: number,
  spawn: { col: number; row: number },
  restore?: CharacterRestore | null,
): EngineCharacter {
  const palette = Math.abs(hashStr(room.role)) % Math.max(paletteCount, 1);

  const tileCol = restore?.tileCol ?? spawn.col;
  const tileRow = restore?.tileRow ?? spawn.row;
  // Snap pixel position to the saved tile so the engine can resume path-
  // finding cleanly from a known cell — exact x/y from a throttled walk
  // sample would leave the sprite between tiles for the first idle frames.
  const x = tileCol * TILE_SIZE;
  const y = (tileRow - 1) * TILE_SIZE;
  const dir = restore?.dir ?? Direction.DOWN;
  // WALK can't be resumed (no path persisted); seated animations are safe
  // because the engine will re-validate seat assignment on the next decision.
  const restoredState = restore?.state;
  const state: CState =
    restoredState === CharacterState.TYPE || restoredState === CharacterState.READ
      ? restoredState
      : CharacterState.IDLE;

  return {
    id: room.role,
    role: room.role,
    profile: room.profile,
    palette,
    state,
    dir,
    x,
    y,
    tileCol,
    tileRow,
    path: [],
    target: null,
    moveProgress: 0,
    frame: 0,
    frameTimer: 0,
    seatId: null,
    intent: intentFor(room.state),
    roomState: room.state,
    currentActivity: null,
    actionTimer: 0,
    wanderTimer: restore ? restoredDecisionDelay() : 0.4 + Math.random() * 0.6,
    flashTimer: 0,
    isBlocked: room.state === 'blocked',
  };
}

/**
 * Apply a persisted restore payload to an existing character without
 * resetting unrelated bookkeeping. Used to reconcile to server state on
 * (re)connect snapshots.
 */
export function restoreCharacterState(c: EngineCharacter, restore: CharacterRestore): void {
  if (typeof restore.tileCol === 'number') c.tileCol = restore.tileCol;
  if (typeof restore.tileRow === 'number') c.tileRow = restore.tileRow;
  c.x = c.tileCol * TILE_SIZE;
  c.y = (c.tileRow - 1) * TILE_SIZE;
  if (restore.dir !== undefined) c.dir = restore.dir;
  c.path = [];
  c.target = null;
  c.currentActivity = null;
  c.actionTimer = 0;
  c.moveProgress = 0;
  const incoming = restore.state;
  c.state =
    incoming === CharacterState.TYPE || incoming === CharacterState.READ
      ? incoming
      : CharacterState.IDLE;
  c.frame = 0;
  c.frameTimer = 0;
  // Give the engine a brief beat before deciding the next action so the
  // restored pose is visible to the user.
  c.wanderTimer = restoredDecisionDelay();
}

/** Pick a wander interval. */
function pickWanderDelay(): number {
  return WANDER_INTERVAL_MIN + Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN);
}

/** Map AWG room state → intended action for the character. */
function intentFor(state: RoomState): EngineCharacter['intent'] {
  switch (state) {
    case 'working':
      return 'seat';
    case 'reviewing':
      return 'seat';
    case 'responding':
      return 'seat';
    case 'dispatching':
      return 'meeting';
    case 'blocked':
      return 'wander';
    case 'idle':
    default:
      return 'seat';
  }
}

/** When seated, what animation to play. */
function seatedAnimFor(state: RoomState): CState {
  if (state === 'reviewing' || state === 'responding') return CharacterState.READ;
  if (state === 'working' || state === 'dispatching') return CharacterState.TYPE;
  return CharacterState.IDLE;
}

/** Update the character's roomState (called when AWG data refreshes). */
export function applyRoomState(c: EngineCharacter, room: AgentRoom): void {
  const prevIntent = c.intent;
  c.roomState = room.state;
  c.profile = room.profile;
  c.isBlocked = room.state === 'blocked';
  c.intent = intentFor(room.state);
  // Real queue work interrupts ambient office actions.
  if (c.intent !== prevIntent) {
    c.currentActivity = null;
    c.actionTimer = 0;
  }
  if (c.intent !== prevIntent && c.state !== CharacterState.WALK) {
    c.wanderTimer = Math.min(c.wanderTimer, 0.5);
  }
}

function dirFromDelta(dc: number, dr: number): Dir {
  if (dr < 0) return Direction.UP;
  if (dr > 0) return Direction.DOWN;
  if (dc < 0) return Direction.LEFT;
  return Direction.RIGHT;
}

function hasMovementPriority(c: EngineCharacter, other: EngineCharacter): boolean {
  const cRank = ROLE_MOVE_PRIORITY[c.role] ?? 99;
  const otherRank = ROLE_MOVE_PRIORITY[other.role] ?? 99;
  if (cRank !== otherRank) return cRank < otherRank;
  return c.role.localeCompare(other.role) < 0;
}

function occupiedTiles(c: EngineCharacter, characters: EngineCharacter[], respectPriority = false): Set<string> {
  const occupied = new Set<string>();
  for (const other of characters) {
    if (other.role === c.role) continue;
    occupied.add(tileKey(other.tileCol, other.tileRow));
    const next = other.path[0];
    if (!next) continue;
    const canClaimMovingReservation =
      respectPriority && hasMovementPriority(c, other) && other.state === CharacterState.WALK;
    if (!canClaimMovingReservation) occupied.add(tileKey(next.col, next.row));
  }
  return occupied;
}

function pathTo(
  c: EngineCharacter,
  target: { col: number; row: number },
  ctx: UpdateContext,
  allowBlockedEnd: boolean,
): Array<{ col: number; row: number }> {
  const dynamicBlocked = occupiedTiles(c, ctx.characters, true);
  if (allowBlockedEnd) dynamicBlocked.delete(tileKey(target.col, target.row));
  return findPath(c.tileCol, c.tileRow, target.col, target.row, ctx.layout, allowBlockedEnd, dynamicBlocked);
}

function isTileReserved(c: EngineCharacter, col: number, row: number, ctx: UpdateContext): boolean {
  return occupiedTiles(c, ctx.characters, true).has(tileKey(col, row));
}

function snapToTile(c: EngineCharacter): void {
  c.x = c.tileCol * TILE_SIZE;
  c.y = (c.tileRow - 1) * TILE_SIZE;
  c.moveProgress = 0;
}

function waitAfterBlockedMove(c: EngineCharacter): void {
  c.path = [];
  c.target = null;
  c.currentActivity = null;
  c.actionTimer = 0;
  c.state = CharacterState.IDLE;
  snapToTile(c);
  c.wanderTimer = COLLISION_WAIT_MIN + Math.random() * (COLLISION_WAIT_MAX - COLLISION_WAIT_MIN);
}

function rerouteOrYield(c: EngineCharacter, ctx: UpdateContext): void {
  snapToTile(c);
  if (c.target) {
    const nextPath = pathTo(c, { col: c.target.col, row: c.target.row }, ctx, c.target.allowBlockedEnd);
    if (nextPath.length > 0) {
      c.path = nextPath;
      c.moveProgress = 0;
      return;
    }
  }
  waitAfterBlockedMove(c);
}

function findTargetSeat(c: EngineCharacter, seats: Seat[]): Seat | null {
  if (c.seatId) {
    const s = seats.find((x) => x.id === c.seatId);
    if (s) return s;
  }
  return seats.find((s) => s.assignedRole === c.role) ?? null;
}

export interface UpdateContext {
  layout: OfficeLayout;
  characters: EngineCharacter[];
  reducedMotion: boolean;
}

export function updateCharacter(c: EngineCharacter, dt: number, ctx: UpdateContext): void {
  const { reducedMotion } = ctx;

  // Animate frame timer (always advances; sprite chooses how to render).
  c.frameTimer += dt;
  const interval =
    c.state === CharacterState.TYPE
      ? TYPE_FRAME_INTERVAL
      : c.state === CharacterState.READ
        ? READ_FRAME_INTERVAL
        : WALK_FRAME_INTERVAL;
  while (c.frameTimer >= interval) {
    c.frameTimer -= interval;
    c.frame = (c.frame + 1) % 1024;
  }

  // Flash timer for blocked.
  if (c.isBlocked) {
    c.flashTimer = (c.flashTimer + dt) % 1;
  } else {
    c.flashTimer = 0;
  }

  // Walking: progress along path.
  if (c.currentActivity && c.actionTimer > 0) {
    c.actionTimer = Math.max(0, c.actionTimer - dt);
    if (c.actionTimer === 0) {
      c.currentActivity = null;
      c.state = CharacterState.IDLE;
      c.wanderTimer = pickWanderDelay();
    }
    return;
  }

  if (c.state === CharacterState.WALK && c.path.length === 0) {
    waitAfterBlockedMove(c);
    return;
  }
  if (c.state === CharacterState.WALK && c.path.length > 0) {
    const next = c.path[0];
    if (isTileReserved(c, next.col, next.row, ctx)) {
      rerouteOrYield(c, ctx);
      return;
    }
    if (reducedMotion) {
      c.tileCol = next.col;
      c.tileRow = next.row;
      c.x = c.tileCol * TILE_SIZE;
      c.y = (c.tileRow - 1) * TILE_SIZE;
      c.path.shift();
      c.moveProgress = 0;
    } else {
      c.moveProgress += dt * WALK_SPEED_TILES_PER_SEC;
      const fromCol = c.tileCol;
      const fromRow = c.tileRow;
      const t = Math.min(c.moveProgress, 1);
      c.x = (fromCol + (next.col - fromCol) * t) * TILE_SIZE;
      c.y = ((fromRow + (next.row - fromRow) * t) - 1) * TILE_SIZE;
      c.dir = dirFromDelta(next.col - fromCol, next.row - fromRow);
      if (c.moveProgress >= 1) {
        c.tileCol = next.col;
        c.tileRow = next.row;
        c.moveProgress = 0;
        c.path.shift();
      }
    }
    if (c.path.length === 0) {
      onArriveAtTarget(c, ctx);
    }
    return;
  }

  // Idle / sitting: decide what to do next.
  c.wanderTimer -= dt;
  if (c.wanderTimer > 0) return;
  c.wanderTimer = pickWanderDelay();

  decideNextAction(c, ctx);
}

function beginActivity(c: EngineCharacter, activity: OfficeActivityDestination): void {
  c.currentActivity = activity;
  c.actionTimer = activity.durationSec;
  c.dir = activity.facingDir;
  c.state = activity.state;
  c.frame = 0;
  c.frameTimer = 0;
}

function onArriveAtTarget(c: EngineCharacter, ctx: UpdateContext): void {
  const arrivedTarget = c.target;
  const seat = findTargetSeat(c, ctx.layout.seats);
  if (seat && c.tileCol === seat.col && c.tileRow === seat.row) {
    c.dir = seat.facingDir;
    c.state = seatedAnimFor(c.roomState);
    c.target = null;
    c.currentActivity = null;
    c.actionTimer = 0;
    c.frame = 0;
    c.frameTimer = 0;
    return;
  }
  if (arrivedTarget?.activityId) {
    const activity = ctx.layout.activities.find((item) => item.id === arrivedTarget.activityId);
    if (activity) {
      c.target = null;
      beginActivity(c, activity);
      return;
    }
  }
  c.target = null;
  c.currentActivity = null;
  c.actionTimer = 0;
  c.state = CharacterState.IDLE;
  c.frame = 0;
}

function decideNextAction(c: EngineCharacter, ctx: UpdateContext): void {
  const seat = findTargetSeat(c, ctx.layout.seats);

  switch (c.intent) {
    case 'seat': {
      if (!seat) {
        startWander(c, ctx);
        return;
      }
      if (c.roomState === 'idle' && c.tileCol === seat.col && c.tileRow === seat.row && Math.random() < IDLE_ERRAND_CHANCE) {
        startAmbientErrand(c, ctx);
        return;
      }
      if (c.tileCol === seat.col && c.tileRow === seat.row) {
        c.dir = seat.facingDir;
        c.path = [];
        c.target = null;
        c.moveProgress = 0;
        c.state = seatedAnimFor(c.roomState);
        return;
      }
      const path = pathTo(c, { col: seat.col, row: seat.row }, ctx, true);
      if (path.length === 0) {
        startWander(c, ctx);
        return;
      }
      c.path = path;
      c.target = { col: seat.col, row: seat.row, allowBlockedEnd: true };
      c.state = CharacterState.WALK;
      c.moveProgress = 0;
      return;
    }
    case 'meeting': {
      const spot = meetingSpotFor(ctx.layout, hashStr(c.role));
      if (c.tileCol === spot.col && c.tileRow === spot.row) {
        c.dir = Direction.UP;
        c.path = [];
        c.target = null;
        c.moveProgress = 0;
        c.state = CharacterState.IDLE;
        return;
      }
      const path = pathTo(c, spot, ctx, false);
      if (path.length === 0) {
        startWander(c, ctx);
        return;
      }
      c.path = path;
      c.target = { col: spot.col, row: spot.row, allowBlockedEnd: false };
      c.state = CharacterState.WALK;
      c.moveProgress = 0;
      return;
    }
    case 'wander':
    case 'stay':
    default: {
      startWander(c, ctx);
      return;
    }
  }
}


function roomIdAt(layout: OfficeLayout, col: number, row: number): string | undefined {
  return layout.rooms.find(
    (zone) => col >= zone.minCol && col <= zone.maxCol && row >= zone.minRow && row <= zone.maxRow,
  )?.id;
}

function roomIdForIntent(c: EngineCharacter, layout: OfficeLayout): string | undefined {
  if (c.intent === 'meeting') return 'meeting';
  if (c.intent === 'wander') return roomIdAt(layout, c.tileCol, c.tileRow);
  const seat = findTargetSeat(c, layout.seats);
  return seat ? roomIdAt(layout, seat.col, seat.row) : roomIdAt(layout, c.tileCol, c.tileRow);
}

function walkToSpot(
  c: EngineCharacter,
  ctx: UpdateContext,
  spot: { col: number; row: number },
  activity?: OfficeActivityDestination | null,
): boolean {
  const path = pathTo(c, spot, ctx, false);
  if (path.length === 0) return false;
  c.path = path;
  c.target = { col: spot.col, row: spot.row, allowBlockedEnd: false, activityId: activity?.id ?? null };
  c.currentActivity = null;
  c.actionTimer = 0;
  c.state = CharacterState.WALK;
  c.moveProgress = 0;
  return true;
}

function startAmbientErrand(c: EngineCharacter, ctx: UpdateContext): void {
  const seed = hashStr(c.role) + c.frame + Math.floor(Math.random() * 1000);
  const activity = officeActivityFor(ctx.layout, seed);
  const spot = activity ?? ambientErrandSpotFor(ctx.layout, seed);
  if (!walkToSpot(c, ctx, spot, activity)) {
    waitAfterBlockedMove(c);
  }
}

function startWander(c: EngineCharacter, ctx: UpdateContext): void {
  const seed = hashStr(c.role) + Math.floor(Math.random() * 1000);
  if (!walkToSpot(c, ctx, wanderSpotFor(ctx.layout, seed, roomIdForIntent(c, ctx.layout)))) {
    waitAfterBlockedMove(c);
  }
}

/**
 * Instantly snap a character to a tile, clearing any active path. Used to
 * reconcile with server-side positions on (re)connect.
 */
export function teleportTo(c: EngineCharacter, col: number, row: number): void {
  c.tileCol = col;
  c.tileRow = row;
  c.x = col * TILE_SIZE;
  c.y = (row - 1) * TILE_SIZE;
  c.path = [];
  c.target = null;
  c.currentActivity = null;
  c.actionTimer = 0;
  c.moveProgress = 0;
  c.state = CharacterState.IDLE;
  c.frame = 0;
  c.frameTimer = 0;
  // Avoid immediately triggering a new wander/seek the next tick.
  c.wanderTimer = restoredDecisionDelay();
}

/**
 * Assign seats to characters based on their roles. Stable mapping: the same role
 * always gets the same seat across rebuilds (sorted by role name).
 */
export function assignSeats(characters: EngineCharacter[], layout: OfficeLayout): void {
  for (const seat of layout.seats) {
    seat.assignedRole = null;
  }
  const sortedRoles = [...characters].sort((a, b) => {
    // Keep lead at index 0, worker at 1; everything else alphabetical after.
    const order: Record<string, number> = { lead: 0, worker: 1 };
    const ao = order[a.role] ?? 99;
    const bo = order[b.role] ?? 99;
    if (ao !== bo) return ao - bo;
    return a.role.localeCompare(b.role);
  });
  for (let i = 0; i < sortedRoles.length && i < layout.seats.length; i++) {
    const seat = layout.seats[i];
    const c = sortedRoles[i];
    seat.assignedRole = c.role;
    c.seatId = seat.id;
  }
}
