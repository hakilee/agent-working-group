import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Page, PageHeader } from '../components/ui/page';
import { useWorkshopWS } from '../hooks/use-workshop-ws';
import { deriveRooms } from '../workshop/room-state';
import type { AgentRoom } from '../workshop/types';
import {
  CharacterState,
  LAYOUT_TILE_COLS,
  LAYOUT_TILE_ROWS,
  TILE_SIZE,
  applyRoomState,
  assignSeats,
  createCamera,
  createCharacter,
  createLayout,
  getCharacters,
  getLayout,
  loadSprites,
  render,
  resizeCamera,
  restoreCharacterState,
  sanitizeRestore,
  screenToWorld,
  setCharacters,
  setLayout,
  setRooms,
  startGameLoop,
  updateCamera,
  updateCharacter,
  type Camera,
  type EngineCharacter,
  type OfficeLayout,
  type SpriteManager,
} from '../workshop/engine';

const MAP_PIXEL_W = LAYOUT_TILE_COLS * TILE_SIZE;
const MAP_PIXEL_H = LAYOUT_TILE_ROWS * TILE_SIZE;

/** Min ms between throttled in-walk WS position updates per agent. */
const POSITION_UPDATE_THROTTLE_MS = 400;

/** Wait this long for both an initial workshop snapshot AND the first queues
 *  frame before showing the canvas anyway. Avoids two visible jitter sources
 *  on refresh: (a) a momentary "facing front" flash from default state, and
 *  (b) a camera snap when characters spawn into the world after reveal. */
const ENGINE_READY_TIMEOUT_MS = 1500;

/** Fixed stage height so layout is stable from the very first paint — the
 *  canvas occupies this exact box before sprites/snapshot are ready, so
 *  there's no top-to-bottom shift when content swaps in. */
const STAGE_HEIGHT_CSS = 'min(70vh, 640px)';

function detectDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

interface HoveredAgent {
  room: AgentRoom;
  screenX: number;
  screenY: number;
}

function stateLabel(state: AgentRoom['state']): string {
  switch (state) {
    case 'working': return 'working';
    case 'dispatching': return 'dispatching';
    case 'reviewing': return 'reviewing';
    case 'responding': return 'responding';
    case 'blocked': return 'blocked';
    case 'idle':
    default: return 'idle';
  }
}

function stateAccentClass(state: AgentRoom['state']): string {
  switch (state) {
    case 'working': return 'text-emerald-600 dark:text-emerald-300';
    case 'dispatching': return 'text-amber-600 dark:text-amber-300';
    case 'reviewing': return 'text-sky-600 dark:text-sky-300';
    case 'responding': return 'text-violet-600 dark:text-violet-300';
    case 'blocked': return 'text-rose-600 dark:text-rose-300';
    case 'idle':
    default: return 'text-ops-muted dark:text-[#839087]';
  }
}

function AgentTooltip({ hovered }: { hovered: HoveredAgent }) {
  const { room, screenX, screenY } = hovered;
  // Offset slightly above-right of cursor; flip to left when near right edge.
  const dx = 14;
  const dy = -8;
  return (
    <div
      className="pointer-events-none absolute z-10 select-none rounded-sm border border-ops-line bg-ops-panel/95 px-2 py-1.5 text-[10px] leading-tight text-ops-ink shadow-md backdrop-blur-sm dark:border-white/15 dark:bg-[#1e2722]/95 dark:text-[#eef3ec]"
      style={{
        left: screenX + dx,
        top: screenY + dy,
        transform: 'translate(0, -100%)',
        maxWidth: 200,
      }}
    >
      <div className="flex items-center gap-1.5 font-bold tracking-wide">
        <span aria-hidden>{room.profile.emoji}</span>
        <span style={{ color: room.profile.color }}>{room.profile.displayName}</span>
      </div>
      <div className="mt-0.5 text-[9px] uppercase tracking-widest text-ops-muted dark:text-[#839087]">
        {room.role}
      </div>
      <div className={`mt-1 font-semibold uppercase tracking-wider ${stateAccentClass(room.state)}`}>
        {stateLabel(room.state)}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[9px] text-ops-muted dark:text-[#839087]">
        <span>pending</span><span className="text-right text-ops-ink dark:text-[#eef3ec]">{room.counts.pending}</span>
        <span>processing</span><span className="text-right text-ops-ink dark:text-[#eef3ec]">{room.counts.processing}</span>
        <span>processed</span><span className="text-right text-ops-ink dark:text-[#eef3ec]">{room.counts.processed}</span>
        <span>dead</span><span className="text-right text-ops-ink dark:text-[#eef3ec]">{room.counts.dead}</span>
      </div>
    </div>
  );
}

export default function Workshop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ws = useWorkshopWS();
  const [sprites, setSprites] = useState<SpriteManager | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSprites().then((mgr) => {
      if (!cancelled) setSprites(mgr);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mark the engine ready only once we have:
  //   - sprites loaded (no missing-tile fallback flash), AND
  //   - the initial position snapshot (no "facing front" flash), AND
  //   - the initial queues frame (so character set is known and the camera
  //     centroid is computed on the real cast before reveal — prevents a
  //     visible camera jump from map-center → character-centroid right after
  //     the loading overlay disappears).
  // A timeout still uncovers the canvas if the server is unreachable, so the
  // empty office can be shown rather than spinning indefinitely.
  useEffect(() => {
    if (engineReady) return;
    if (!sprites) return;
    if (ws.snapshotNonce > 0 && ws.queuesNonce > 0) {
      setEngineReady(true);
      return;
    }
    const t = window.setTimeout(() => setEngineReady(true), ENGINE_READY_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [ws.snapshotNonce, ws.queuesNonce, engineReady, sprites]);

  const rooms = useMemo(() => deriveRooms(ws.queueAgents), [ws.queueAgents]);
  const hoveredRoom = useMemo<AgentRoom | null>(() => {
    if (!hoveredRole) return null;
    return rooms.find((r) => r.role === hoveredRole) ?? null;
  }, [hoveredRole, rooms]);

  // Refs sourced from module-level state so they survive page navigation.
  const charactersRef = useRef<EngineCharacter[]>(getCharacters());
  const layoutRef = useRef<OfficeLayout | null>(getLayout());
  const roomsRef = useRef<AgentRoom[]>(rooms);
  const darkModeRef = useRef<boolean>(detectDarkMode());
  const reducedMotionRef = useRef<boolean>(detectReducedMotion());
  const cameraRef = useRef<Camera | null>(null);
  const agentPositionsRef = useRef(ws.agentPositions);
  const sendAgentUpdateRef = useRef(ws.sendAgentUpdate);
  const engineReadyRef = useRef(engineReady);
  const hoveredRoleRef = useRef<string | null>(null);
  const pointerScreenRef = useRef<{ x: number; y: number } | null>(null);
  const lastSentRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    agentPositionsRef.current = ws.agentPositions;
  }, [ws.agentPositions]);

  useEffect(() => {
    sendAgentUpdateRef.current = ws.sendAgentUpdate;
  }, [ws.sendAgentUpdate]);

  useEffect(() => {
    engineReadyRef.current = engineReady;
  }, [engineReady]);

  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => {
      darkModeRef.current = detectDarkMode();
    });
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  // Reflect rooms into refs and reconcile characters / seats.
  useEffect(() => {
    roomsRef.current = rooms;
    setRooms(rooms);
    if (!sprites) return;
    const palCount = Math.max(sprites.characters.length, 1);
    const needed = rooms.length;

    if (!layoutRef.current || layoutRef.current.seats.length < needed) {
      layoutRef.current = createLayout(needed);
      setLayout(layoutRef.current);
    }

    const existing = new Map(charactersRef.current.map((c) => [c.role, c]));
    const next: EngineCharacter[] = [];
    for (const room of rooms) {
      const found = existing.get(room.role);
      if (found) {
        applyRoomState(found, room);
        next.push(found);
      } else {
        const stored = sanitizeRestore(agentPositionsRef.current[room.role]);
        const spawnCol = stored?.tileCol ?? Math.floor(LAYOUT_TILE_COLS / 2);
        const spawnRow = stored?.tileRow ?? LAYOUT_TILE_ROWS - 2;
        next.push(createCharacter(room, palCount, { col: spawnCol, row: spawnRow }, stored));
      }
    }
    charactersRef.current = next;
    setCharacters(next);
    // Trim per-agent throttle state for any role that no longer exists so the
    // map can't grow unbounded across long-lived sessions.
    const liveRoles = new Set(next.map((c) => c.role));
    for (const k of [...lastSentRef.current.keys()]) {
      if (!liveRoles.has(k)) lastSentRef.current.delete(k);
    }
    if (layoutRef.current) {
      assignSeats(charactersRef.current, layoutRef.current);
    }
  }, [rooms, sprites]);

  // On authoritative snapshot arrival: reconcile characters to server state.
  // Reads from refs (not directly from props) so we don't fire on every local
  // optimistic position write.
  useEffect(() => {
    if (ws.snapshotNonce === 0) return;
    const positions = agentPositionsRef.current;
    for (const c of charactersRef.current) {
      const stored = sanitizeRestore(positions[c.role]);
      if (!stored) continue;
      // If the character is mid-walk locally and the snapshot is consistent
      // (same tile), don't disrupt the in-flight motion. Otherwise hard-snap.
      if (
        c.state === CharacterState.WALK &&
        stored.tileCol === c.tileCol &&
        stored.tileRow === c.tileRow
      ) {
        continue;
      }
      restoreCharacterState(c, stored);
    }
  }, [ws.snapshotNonce]);

  // Pointer tracking → hover tooltip. Hit-tests in world space using the
  // current camera transform; reads from refs so we never go stale on
  // re-renders.
  const handlePointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const cam = cameraRef.current;
    if (!canvas || !cam || !sprites) return;
    const rect = canvas.getBoundingClientRect();
    // Camera math is in CSS px; pointer coords are CSS px relative to canvas.
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    pointerScreenRef.current = { x: sx, y: sy };

    const world = screenToWorld(cam, sx, sy);
    let hit: string | null = null;
    // Walk reverse so the topmost (drawn last) wins ties.
    const list = charactersRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      const x0 = c.x;
      const y0 = c.y;
      // Slight expansion makes hover feel less finicky on tiny sprites.
      if (
        world.x >= x0 - 1 &&
        world.x < x0 + sprites.charFrameW + 1 &&
        world.y >= y0 - 1 &&
        world.y < y0 + sprites.charFrameH + 1
      ) {
        hit = c.role;
        break;
      }
    }
    if (hit !== hoveredRoleRef.current) {
      hoveredRoleRef.current = hit;
      setHoveredRole(hit);
    }
    if (hit) {
      setHoverPos({ x: sx, y: sy });
    } else if (hoverPos !== null) {
      setHoverPos(null);
    }
  }, [sprites, hoverPos]);

  const handlePointerLeave = useCallback(() => {
    pointerScreenRef.current = null;
    if (hoveredRoleRef.current !== null) {
      hoveredRoleRef.current = null;
      setHoveredRole(null);
    }
    if (hoverPos !== null) setHoverPos(null);
  }, [hoverPos]);

  useEffect(() => {
    if (!sprites) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (!layoutRef.current) {
      layoutRef.current = createLayout(Math.max(rooms.length, 2));
      setLayout(layoutRef.current);
    }

    const computeCameraTarget = (): { x: number; y: number } => {
      const chars = charactersRef.current;
      if (chars.length === 0) {
        return { x: MAP_PIXEL_W / 2, y: MAP_PIXEL_H / 2 };
      }
      let sx = 0;
      let sy = 0;
      for (const c of chars) {
        sx += c.x + 8;
        sy += c.y + 16;
      }
      return { x: sx / chars.length, y: sy / chars.length };
    };

    const syncSize = () => {
      // Track device pixel ratio so pixel-art stays crisp on HiDPI displays.
      // The CSS size still matches the container; only the backing store grows.
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      const cssW = Math.max(1, Math.floor(container.clientWidth));
      const cssH = Math.max(1, Math.floor(container.clientHeight));
      const w = Math.max(1, Math.floor(cssW * dpr));
      const h = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      if (!cameraRef.current) {
        cameraRef.current = createCamera(cssW, cssH, MAP_PIXEL_W, MAP_PIXEL_H, dpr);
      } else {
        resizeCamera(cameraRef.current, cssW, cssH, MAP_PIXEL_W, MAP_PIXEL_H, dpr);
      }
      // Seed the camera on the real character centroid (or map center if
      // there are no characters yet) so the very first paint after reveal is
      // already in the right place — no "snap" from map-center to centroid
      // when the game loop's first tick fires.
      const target = computeCameraTarget();
      updateCamera(cameraRef.current, target.x, target.y, MAP_PIXEL_W, MAP_PIXEL_H);
    };
    syncSize();

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(container);

    const stop = startGameLoop(canvas, {
      update: (dt) => {
        // Don't run any character AI or camera motion before reveal — this
        // keeps the (still-hidden) canvas in a deterministic, fully-settled
        // state so the first visible frame after the loading curtain lifts
        // is the same as the last hidden frame: no apparent motion.
        if (!engineReadyRef.current) return;
        const layout = layoutRef.current;
        if (!layout) return;
        const now = performance.now();
        for (const c of charactersRef.current) {
          const prevState = c.state;
          const prevTileCol = c.tileCol;
          const prevTileRow = c.tileRow;
          updateCharacter(c, dt, {
            layout,
            characters: charactersRef.current,
            reducedMotion: reducedMotionRef.current,
          });

          // Persist on tile crossing during a walk (throttled per agent).
          if (
            c.state === CharacterState.WALK &&
            (c.tileCol !== prevTileCol || c.tileRow !== prevTileRow)
          ) {
            const last = lastSentRef.current.get(c.role) ?? 0;
            if (now - last >= POSITION_UPDATE_THROTTLE_MS) {
              lastSentRef.current.set(c.role, now);
              sendAgentUpdateRef.current(c.role, {
                x: Math.round(c.x),
                y: Math.round(c.y),
                tileCol: c.tileCol,
                tileRow: c.tileRow,
                dir: c.dir,
                state: 'walk',
              });
            }
          }
          // Always persist on transition out of WALK (arrival, blocked stop).
          if (prevState === CharacterState.WALK && c.state !== CharacterState.WALK) {
            lastSentRef.current.set(c.role, now);
            sendAgentUpdateRef.current(c.role, {
              x: Math.round(c.x),
              y: Math.round(c.y),
              tileCol: c.tileCol,
              tileRow: c.tileRow,
              dir: c.dir,
              state: c.state,
            });
          }
        }
        // Camera follow: center on character centroid. Only adjust once
        // there are characters — otherwise leave the camera at whatever
        // syncSize() seeded it with (map center) so we never snap.
        const cam = cameraRef.current;
        if (cam && charactersRef.current.length > 0) {
          const target = computeCameraTarget();
          updateCamera(cam, target.x, target.y, MAP_PIXEL_W, MAP_PIXEL_H);
        }
      },
      render: (ctx) => {
        if (!engineReadyRef.current) {
          // Clear to letterbox color so the canvas isn't transparent before
          // we have the first authoritative state.
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = darkModeRef.current ? '#06090a' : '#1c1a14';
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          ctx.restore();
          return;
        }
        const layout = layoutRef.current;
        const cam = cameraRef.current;
        if (!layout || !sprites || !cam) return;
        render(ctx, {
          layout,
          characters: charactersRef.current,
          sprites,
          darkMode: darkModeRef.current,
          camera: cam,
          hoveredRole: hoveredRoleRef.current,
        });
      },
    });
    return () => {
      ro.disconnect();
      stop();
    };
  }, [sprites, rooms.length]);

  // On unmount, push any in-flight position so a quick refresh during walk
  // captures the latest sample.
  useEffect(() => {
    return () => {
      for (const c of getCharacters()) {
        sendAgentUpdateRef.current(c.role, {
          x: Math.round(c.x),
          y: Math.round(c.y),
          tileCol: c.tileCol,
          tileRow: c.tileRow,
          dir: c.dir,
          state: c.state === CharacterState.WALK ? 'idle' : c.state,
        });
      }
    };
  }, []);

  return (
    <Page>
      <PageHeader eyebrow="Workshop" title="Office">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-ops-muted dark:text-[#839087]">
          <span
            className={
              ws.connected
                ? 'text-emerald-600 dark:text-emerald-300'
                : 'text-amber-600 dark:text-amber-300'
            }
            title={ws.connected ? 'live connection' : 'reconnecting'}
          >
            {ws.connected ? '● live' : '○ reconnecting'}
          </span>
          <span>
            {rooms.length} {rooms.length === 1 ? 'agent' : 'agents'}
          </span>
        </div>
      </PageHeader>

      {ws.error && !ws.connected && (
        <div className="border border-rose-500 bg-rose-50/80 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
          {ws.error}
        </div>
      )}

      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-none border border-ops-line bg-black/5 dark:border-white/15 dark:bg-white/5"
        style={{ height: STAGE_HEIGHT_CSS }}
      >
        <canvas
          ref={canvasRef}
          aria-label="Agent workshop office"
          className="block cursor-default"
          style={{
            imageRendering: 'pixelated',
            width: '100%',
            height: '100%',
          }}
          onPointerMove={handlePointer}
          onPointerLeave={handlePointerLeave}
        />
        {hoveredRoom && hoverPos && (
          <AgentTooltip
            hovered={{ room: hoveredRoom, screenX: hoverPos.x, screenY: hoverPos.y }}
          />
        )}
        {(!sprites || !engineReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] uppercase tracking-widest text-white">
            {!sprites ? 'Loading sprites…' : 'Connecting…'}
          </div>
        )}
      </div>

      {rooms.length === 0 && (
        <div className="flex min-h-20 items-center justify-center border border-dashed border-ops-line bg-ops-panel p-3 text-xs text-ops-muted dark:border-white/15 dark:bg-[#1e2722]/85 dark:text-[#839087]">
          No agents found. Waiting for queue activity…
        </div>
      )}
    </Page>
  );
}
