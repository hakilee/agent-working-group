import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  resizeCamera,
  restoreCharacterState,
  sanitizeRestore,
  setCharacters,
  setLayout,
  setRooms,
  updateCamera,
  updateCharacter,
  worldToScreen,
  type Camera,
  type EngineCharacter,
  type OfficeLayout,
  type TaskPulse,
} from '../workshop/engine';
import { ThreeWorkshopRenderer } from '../workshop/three/renderer';
import { loadThreeSprites, type ThreeSpriteManager } from '../workshop/three/textures';

const MAP_PIXEL_W = LAYOUT_TILE_COLS * TILE_SIZE;
const MAP_PIXEL_H = LAYOUT_TILE_ROWS * TILE_SIZE;

const POSITION_UPDATE_THROTTLE_MS = 400;
const ENGINE_READY_TIMEOUT_MS = 1500;
const STAGE_HEIGHT_CSS = 'min(70vh, 640px)';

function detectDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

interface HoverTarget {
  role: string;
  x: number;
  y: number;
  bounds: { width: number; height: number };
}

interface TooltipPlacement {
  left: number;
  top: number;
  width: number;
  transform: string;
}

const TOOLTIP_WIDTH = 200;
const TOOLTIP_ESTIMATED_HEIGHT = 116;
const TOOLTIP_EDGE_GAP = 8;
const TOOLTIP_CURSOR_GAP = 14;
const COUNT_FIELDS = ['pending', 'processing', 'processed', 'dead'] as const;
const TASK_PULSE_DURATION_MS = 1250;
const COMPLETE_PULSE_DURATION_MS = 900;
const MAX_TASK_PULSES = 8;

type CountSnapshot = Record<(typeof COUNT_FIELDS)[number], number>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function countSnapshot(room: AgentRoom): CountSnapshot {
  return {
    pending: room.counts.pending,
    processing: room.counts.processing,
    processed: room.counts.processed,
    dead: room.counts.dead,
  };
}

function tooltipPlacement(target: HoverTarget): TooltipPlacement {
  const width = Math.min(TOOLTIP_WIDTH, Math.max(0, target.bounds.width - TOOLTIP_EDGE_GAP * 2));
  const hasRoomOnRight = target.x + width + TOOLTIP_CURSOR_GAP <= target.bounds.width - TOOLTIP_EDGE_GAP;
  const hasRoomAbove = target.y >= TOOLTIP_ESTIMATED_HEIGHT + TOOLTIP_EDGE_GAP;
  const hasRoomBelow =
    target.y + TOOLTIP_ESTIMATED_HEIGHT + TOOLTIP_CURSOR_GAP <= target.bounds.height - TOOLTIP_EDGE_GAP;
  const placeAbove = hasRoomAbove || !hasRoomBelow;
  const rawLeft = hasRoomOnRight ? target.x + TOOLTIP_CURSOR_GAP : target.x - TOOLTIP_CURSOR_GAP - width;

  return {
    left: clamp(rawLeft, TOOLTIP_EDGE_GAP, target.bounds.width - width - TOOLTIP_EDGE_GAP),
    top: placeAbove ? target.y - TOOLTIP_EDGE_GAP : target.y + TOOLTIP_CURSOR_GAP,
    width,
    transform: placeAbove ? 'translateY(-100%)' : 'translateY(0)',
  };
}

function shouldKeepLocalWalk(c: EngineCharacter, stored: { tileCol?: number; tileRow?: number }): boolean {
  if (c.state !== CharacterState.WALK) return false;
  if (stored.tileCol === undefined || stored.tileRow === undefined) return false;
  if (stored.tileCol === c.tileCol && stored.tileRow === c.tileRow) return true;
  const tileLag = Math.abs(stored.tileCol - c.tileCol) + Math.abs(stored.tileRow - c.tileRow);
  return c.path.length > 0 && tileLag === 1;
}

function stateAccentClass(state: AgentRoom['state']): string {
  switch (state) {
    case 'working':
      return 'text-emerald-600 dark:text-emerald-300';
    case 'dispatching':
      return 'text-amber-600 dark:text-amber-300';
    case 'reviewing':
      return 'text-sky-600 dark:text-sky-300';
    case 'responding':
      return 'text-violet-600 dark:text-violet-300';
    case 'blocked':
      return 'text-rose-600 dark:text-rose-300';
    case 'idle':
    default:
      return 'text-ops-muted dark:text-[#839087]';
  }
}

function AgentTooltip({ room, target }: { room: AgentRoom; target: HoverTarget }) {
  const placement = tooltipPlacement(target);
  return (
    <div
      className="pointer-events-none absolute z-10 select-none rounded-sm border border-ops-line bg-ops-panel/95 px-2 py-1.5 text-[10px] leading-tight text-ops-ink shadow-md backdrop-blur-sm dark:border-white/15 dark:bg-[#1e2722]/95 dark:text-[#eef3ec]"
      style={placement}
    >
      <div className="font-bold tracking-wide" style={{ color: room.profile.color }}>
        {room.profile.displayName}
      </div>
      <div className={`mt-1 font-semibold uppercase tracking-wider ${stateAccentClass(room.state)}`}>
        {room.state}
      </div>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[9px] text-ops-muted dark:text-[#839087]">
        {COUNT_FIELDS.map((field) => (
          <Fragment key={field}>
            <dt>{field}</dt>
            <dd className="text-right text-ops-ink dark:text-[#eef3ec]">{room.counts[field]}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

interface BubbleOverlay {
  role: string;
  x: number;
  y: number;
  label?: string;
  glyph?: string;
  color: string;
  blocked: boolean;
}

function AgentBubbles({ overlays }: { overlays: BubbleOverlay[] }) {
  return (
    <>
      {overlays.map((o) => (
        <Fragment key={o.role}>
          {o.label && (
            <div
              className="pointer-events-none absolute z-[5] -translate-x-1/2 -translate-y-full rounded border bg-ops-panel/95 px-1.5 py-0.5 font-mono text-[8px] leading-none text-ops-ink shadow-sm backdrop-blur-sm dark:bg-[#1e2722]/95 dark:text-[#eef3ec]"
              style={{ left: o.x, top: o.y - 14, borderColor: o.color }}
            >
              {o.label}
            </div>
          )}
          {o.glyph && (
            <div
              className="pointer-events-none absolute z-[6] flex h-3 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[8px] font-bold text-white shadow-sm"
              style={{ left: o.x, top: o.y - 4, background: o.blocked ? '#dc2626' : o.color }}
            >
              {o.glyph}
            </div>
          )}
        </Fragment>
      ))}
    </>
  );
}

function bubbleGlyphForState(state: AgentRoom['state']): string | undefined {
  switch (state) {
    case 'dispatching':
      return '!';
    case 'reviewing':
      return '?';
    case 'responding':
      return '↩';
    case 'blocked':
      return '×';
    default:
      return undefined;
  }
}

export default function Workshop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ws = useWorkshopWS();
  const [sprites, setSprites] = useState<ThreeSpriteManager | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const [bubbles, setBubbles] = useState<BubbleOverlay[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadThreeSprites().then((mgr) => {
      if (!cancelled) setSprites(mgr);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!hoverTarget) return null;
    return rooms.find((r) => r.role === hoverTarget.role) ?? null;
  }, [hoverTarget, rooms]);

  const charactersRef = useRef<EngineCharacter[]>(getCharacters());
  const layoutRef = useRef<OfficeLayout | null>(getLayout());
  const darkModeRef = useRef<boolean>(detectDarkMode());
  const reducedMotionRef = useRef<boolean>(detectReducedMotion());
  const cameraRef = useRef<Camera | null>(null);
  const rendererRef = useRef<ThreeWorkshopRenderer | null>(null);
  const agentPositionsRef = useRef(ws.agentPositions);
  const sendAgentUpdateRef = useRef(ws.sendAgentUpdate);
  const engineReadyRef = useRef(engineReady);
  const hoveredRoleRef = useRef<string | null>(null);
  const lastSentRef = useRef<Map<string, number>>(new Map());
  const prevCountsRef = useRef<Map<string, CountSnapshot>>(new Map());
  const taskPulsesRef = useRef<TaskPulse[]>([]);
  const taskPulseSeqRef = useRef(0);
  const bubbleFlushRef = useRef(0);

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
    const prev = prevCountsRef.current;
    const next = new Map<string, CountSnapshot>();
    const roles = new Set(rooms.map((room) => room.role));
    const lead = rooms.find((room) => room.role === 'lead') ?? rooms[0] ?? null;
    const pulses = taskPulsesRef.current;
    const now = performance.now();

    for (const room of rooms) {
      const counts = countSnapshot(room);
      const before = prev.get(room.role);
      next.set(room.role, counts);
      if (!before) continue;

      const pendingDelta = counts.pending - before.pending;
      const processingDelta = counts.processing - before.processing;
      const processedDelta = counts.processed - before.processed;
      const handoffCount = Math.max(pendingDelta, processingDelta, 0);

      for (let i = 0; i < handoffCount; i++) {
        pulses.push({
          id: `handoff-${now}-${taskPulseSeqRef.current++}`,
          kind: 'handoff',
          fromRole: lead && lead.role !== room.role ? lead.role : null,
          toRole: room.role,
          startedAt: now + i * 140,
          durationMs: TASK_PULSE_DURATION_MS,
        });
      }
      for (let i = 0; i < Math.max(processedDelta, 0); i++) {
        pulses.push({
          id: `complete-${now}-${taskPulseSeqRef.current++}`,
          kind: 'complete',
          fromRole: null,
          toRole: room.role,
          startedAt: now + i * 120,
          durationMs: COMPLETE_PULSE_DURATION_MS,
        });
      }
    }

    taskPulsesRef.current = pulses
      .filter((pulse) => roles.has(pulse.toRole) && now - pulse.startedAt <= pulse.durationMs)
      .slice(-MAX_TASK_PULSES);
    prevCountsRef.current = next;
  }, [rooms]);

  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => {
      darkModeRef.current = detectDarkMode();
    });
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setRooms(rooms);
    if (!sprites) return;
    const palCount = Math.max(sprites.characterSheetSrc.length, 1);
    const needed = rooms.length;

    if (!layoutRef.current || layoutRef.current.seats.length < needed) {
      layoutRef.current = createLayout(needed);
      setLayout(layoutRef.current);
      rendererRef.current?.syncLayout(layoutRef.current);
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
    const liveRoles = new Set(next.map((c) => c.role));
    for (const k of [...lastSentRef.current.keys()]) {
      if (!liveRoles.has(k)) lastSentRef.current.delete(k);
    }
    if (layoutRef.current) {
      assignSeats(charactersRef.current, layoutRef.current);
    }
    rendererRef.current?.syncCharacters(next);
  }, [rooms, sprites]);

  useEffect(() => {
    if (ws.snapshotNonce === 0) return;
    const positions = agentPositionsRef.current;
    for (const c of charactersRef.current) {
      const stored = sanitizeRestore(positions[c.role]);
      if (!stored) continue;
      if (shouldKeepLocalWalk(c, stored)) continue;
      restoreCharacterState(c, stored);
    }
  }, [ws.snapshotNonce]);

  const handlePointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer || !sprites) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = renderer.pickCharacter(sx, sy);
    hoveredRoleRef.current = hit;
    if (!hit) {
      setHoverTarget(null);
      return;
    }
    setHoverTarget((prev) => {
      if (
        prev?.role === hit &&
        Math.abs(prev.x - sx) < 1 &&
        Math.abs(prev.y - sy) < 1 &&
        prev.bounds.width === rect.width &&
        prev.bounds.height === rect.height
      ) return prev;
      return {
        role: hit,
        x: sx,
        y: sy,
        bounds: { width: rect.width, height: rect.height },
      };
    });
  }, [sprites]);

  const handlePointerLeave = useCallback(() => {
    hoveredRoleRef.current = null;
    setHoverTarget(null);
  }, []);

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

    const dprInitial = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const cssW0 = Math.max(1, Math.floor(container.clientWidth));
    const cssH0 = Math.max(1, Math.floor(container.clientHeight));
    cameraRef.current = createCamera(cssW0, cssH0, MAP_PIXEL_W, MAP_PIXEL_H, dprInitial);
    const tgt0 = computeCameraTarget();
    updateCamera(cameraRef.current, tgt0.x, tgt0.y, MAP_PIXEL_W, MAP_PIXEL_H);

    const renderer = new ThreeWorkshopRenderer({
      canvas,
      sprites,
      mapPixelW: MAP_PIXEL_W,
      mapPixelH: MAP_PIXEL_H,
      cssW: cssW0,
      cssH: cssH0,
      dpr: dprInitial,
    });
    rendererRef.current = renderer;
    renderer.applyEngineCamera(cameraRef.current);
    if (layoutRef.current) renderer.syncLayout(layoutRef.current);
    renderer.syncCharacters(charactersRef.current);

    const syncSize = () => {
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      const cssW = Math.max(1, Math.floor(container.clientWidth));
      const cssH = Math.max(1, Math.floor(container.clientHeight));
      const cam = cameraRef.current;
      if (cam) {
        resizeCamera(cam, cssW, cssH, MAP_PIXEL_W, MAP_PIXEL_H, dpr);
      }
      renderer.resize(cssW, cssH, dpr);
      const target = computeCameraTarget();
      if (cam) updateCamera(cam, target.x, target.y, MAP_PIXEL_W, MAP_PIXEL_H);
    };
    syncSize();

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(container);

    let last = performance.now();
    let raf = 0;
    let stopped = false;

    const tick = (now: number) => {
      if (stopped) return;
      const rawDt = (now - last) / 1000;
      last = now;
      const dt = Math.min(rawDt, 0.1);

      if (engineReadyRef.current && layoutRef.current) {
        const layout = layoutRef.current;
        const nowMs = performance.now();
        taskPulsesRef.current = taskPulsesRef.current.filter(
          (pulse) => nowMs - pulse.startedAt <= pulse.durationMs,
        );
        for (const c of charactersRef.current) {
          const prevState = c.state;
          const prevTileCol = c.tileCol;
          const prevTileRow = c.tileRow;
          updateCharacter(c, dt, {
            layout,
            characters: charactersRef.current,
            reducedMotion: reducedMotionRef.current,
          });

          if (
            c.state === CharacterState.WALK &&
            (c.tileCol !== prevTileCol || c.tileRow !== prevTileRow)
          ) {
            const lastSent = lastSentRef.current.get(c.role) ?? 0;
            if (nowMs - lastSent >= POSITION_UPDATE_THROTTLE_MS) {
              lastSentRef.current.set(c.role, nowMs);
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
          if (prevState === CharacterState.WALK && c.state !== CharacterState.WALK) {
            lastSentRef.current.set(c.role, nowMs);
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
        const cam = cameraRef.current;
        if (cam && charactersRef.current.length > 0) {
          const target = computeCameraTarget();
          updateCamera(cam, target.x, target.y, MAP_PIXEL_W, MAP_PIXEL_H);
        }
      }

      const cam = cameraRef.current;
      if (cam) renderer.applyEngineCamera(cam);

      if (!engineReadyRef.current) {
        renderer.render();
      } else {
        renderer.update(
          {
            layout: layoutRef.current,
            characters: charactersRef.current,
            darkMode: darkModeRef.current,
            camera: cam!,
            hoveredRole: hoveredRoleRef.current,
            taskPulses: taskPulsesRef.current,
            nowMs: performance.now(),
          },
          dt,
        );
        renderer.render();

        // Refresh bubble overlays at ~8fps to limit React churn.
        bubbleFlushRef.current += dt;
        if (bubbleFlushRef.current >= 0.12) {
          bubbleFlushRef.current = 0;
          const list: BubbleOverlay[] = [];
          for (const c of charactersRef.current) {
            const center = { x: c.x + 8, y: c.y };
            const screen = cam ? worldToScreen(cam, center.x, center.y) : { x: 0, y: 0 };
            const glyph = bubbleGlyphForState(c.roomState);
            const label = c.currentActivity && c.actionTimer > 0 ? c.currentActivity.label : undefined;
            if (!glyph && !label) continue;
            list.push({
              role: c.role,
              x: screen.x,
              y: screen.y,
              label,
              glyph,
              color: c.profile.color,
              blocked: c.isBlocked,
            });
          }
          setBubbles(list);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [sprites, rooms.length]);

  useEffect(() => {
    return () => {
      for (const c of getCharacters()) {
        const state = c.state === CharacterState.WALK ? CharacterState.IDLE : c.state;
        sendAgentUpdateRef.current(c.role, {
          x: c.tileCol * TILE_SIZE,
          y: (c.tileRow - 1) * TILE_SIZE,
          tileCol: c.tileCol,
          tileRow: c.tileRow,
          dir: c.dir,
          state,
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
        <AgentBubbles overlays={bubbles} />
        {hoveredRoom && hoverTarget && <AgentTooltip room={hoveredRoom} target={hoverTarget} />}
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
