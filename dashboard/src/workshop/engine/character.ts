import type { AgentRoom, RoomState } from '../types';
import { meetingSpotFor, wanderSpotFor } from './office-layout';
import { findPath } from './pathfinding';
import {
  CharacterState,
  Direction,
  TILE_SIZE,
  type CharacterState as CState,
  type Direction as Dir,
  type EngineCharacter,
  type OfficeLayout,
  type Seat,
} from './types';

const WALK_SPEED_TILES_PER_SEC = 3.2;
const WALK_FRAME_INTERVAL = 0.16;
const TYPE_FRAME_INTERVAL = 0.45;
const READ_FRAME_INTERVAL = 0.6;
const WANDER_INTERVAL_MIN = 4;
const WANDER_INTERVAL_MAX = 9;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function createCharacter(
  room: AgentRoom,
  paletteCount: number,
  spawn: { col: number; row: number },
): EngineCharacter {
  const palette = Math.abs(hashStr(room.role)) % Math.max(paletteCount, 1);
  return {
    id: room.role,
    role: room.role,
    profile: room.profile,
    palette,
    state: CharacterState.IDLE,
    dir: Direction.DOWN,
    x: spawn.col * TILE_SIZE,
    y: (spawn.row - 1) * TILE_SIZE,
    tileCol: spawn.col,
    tileRow: spawn.row,
    path: [],
    moveProgress: 0,
    frame: 0,
    frameTimer: 0,
    seatId: null,
    intent: intentFor(room.state),
    roomState: room.state,
    wanderTimer: 0.4 + Math.random() * 0.6,
    flashTimer: 0,
    isBlocked: room.state === 'blocked',
  };
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
  // If intent changed and we're not currently walking, force a re-decision soon.
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

function pathTo(
  c: EngineCharacter,
  target: { col: number; row: number },
  layout: OfficeLayout,
  allowBlockedEnd: boolean,
): Array<{ col: number; row: number }> {
  return findPath(c.tileCol, c.tileRow, target.col, target.row, layout, allowBlockedEnd);
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
  const { layout, reducedMotion } = ctx;

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
  if (c.state === CharacterState.WALK && c.path.length > 0) {
    const next = c.path[0];
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

function onArriveAtTarget(c: EngineCharacter, ctx: UpdateContext): void {
  // If we walked to our seat tile, sit and play the seated animation.
  const seat = findTargetSeat(c, ctx.layout.seats);
  if (seat && c.tileCol === seat.col && c.tileRow === seat.row) {
    c.dir = seat.facingDir;
    c.state = seatedAnimFor(c.roomState);
    c.frame = 0;
    c.frameTimer = 0;
    return;
  }
  // Otherwise, we arrived at a wander/meeting spot — idle there.
  c.state = c.intent === 'meeting' ? CharacterState.IDLE : CharacterState.IDLE;
  c.frame = 0;
}

function decideNextAction(c: EngineCharacter, ctx: UpdateContext): void {
  const seat = findTargetSeat(c, ctx.layout.seats);

  switch (c.intent) {
    case 'seat': {
      if (!seat) {
        // No seat assigned — wander.
        startWander(c, ctx);
        return;
      }
      if (c.tileCol === seat.col && c.tileRow === seat.row) {
        c.dir = seat.facingDir;
        c.state = seatedAnimFor(c.roomState);
        return;
      }
      const path = pathTo(c, { col: seat.col, row: seat.row }, ctx.layout, true);
      if (path.length === 0) {
        startWander(c, ctx);
        return;
      }
      c.path = path;
      c.state = CharacterState.WALK;
      c.moveProgress = 0;
      return;
    }
    case 'meeting': {
      const spot = meetingSpotFor(ctx.layout, hashStr(c.role));
      if (c.tileCol === spot.col && c.tileRow === spot.row) {
        c.dir = Direction.UP;
        c.state = CharacterState.IDLE;
        return;
      }
      const path = pathTo(c, spot, ctx.layout, false);
      if (path.length === 0) {
        startWander(c, ctx);
        return;
      }
      c.path = path;
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

function startWander(c: EngineCharacter, ctx: UpdateContext): void {
  const seed = hashStr(c.role) + Math.floor(Math.random() * 1000);
  const spot = wanderSpotFor(ctx.layout, seed);
  const path = pathTo(c, spot, ctx.layout, false);
  if (path.length === 0) {
    c.state = CharacterState.IDLE;
    return;
  }
  c.path = path;
  c.state = CharacterState.WALK;
  c.moveProgress = 0;
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
  c.moveProgress = 0;
  c.state = CharacterState.IDLE;
  c.frame = 0;
  c.frameTimer = 0;
  // Avoid immediately triggering a new wander/seek the next tick.
  c.wanderTimer = pickWanderDelay();
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
