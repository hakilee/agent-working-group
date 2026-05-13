import { useEffect, useMemo, useRef, useState } from 'react';
import { Page, PageHeader } from '../components/ui/page';
import { useWorkshopWS } from '../hooks/use-workshop-ws';
import { deriveRooms } from '../workshop/room-state';
import type { AgentRoom } from '../workshop/types';
import {
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
  setCharacters,
  setLayout,
  setRooms,
  startGameLoop,
  teleportTo,
  updateCamera,
  updateCharacter,
  type Camera,
  type EngineCharacter,
  type OfficeLayout,
  type SpriteManager,
} from '../workshop/engine';

const MAP_PIXEL_W = LAYOUT_TILE_COLS * TILE_SIZE;
const MAP_PIXEL_H = LAYOUT_TILE_ROWS * TILE_SIZE;

function detectDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export default function Workshop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ws = useWorkshopWS();
  const [sprites, setSprites] = useState<SpriteManager | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSprites().then((mgr) => {
      if (!cancelled) setSprites(mgr);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rooms = useMemo(() => deriveRooms(ws.queueAgents), [ws.queueAgents]);

  // Refs sourced from module-level state so they survive page navigation.
  const charactersRef = useRef<EngineCharacter[]>(getCharacters());
  const layoutRef = useRef<OfficeLayout | null>(getLayout());
  const roomsRef = useRef<AgentRoom[]>(rooms);
  const darkModeRef = useRef<boolean>(detectDarkMode());
  const reducedMotionRef = useRef<boolean>(detectReducedMotion());
  const cameraRef = useRef<Camera | null>(null);
  const agentPositionsRef = useRef(ws.agentPositions);
  const sendAgentUpdateRef = useRef(ws.sendAgentUpdate);
  const arrivedAtRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    agentPositionsRef.current = ws.agentPositions;
  }, [ws.agentPositions]);

  useEffect(() => {
    sendAgentUpdateRef.current = ws.sendAgentUpdate;
  }, [ws.sendAgentUpdate]);

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
    const activeRoles = new Set<string>();
    for (const room of rooms) {
      activeRoles.add(room.role);
      const found = existing.get(room.role);
      if (found) {
        applyRoomState(found, room);
        next.push(found);
      } else {
        const stored = agentPositionsRef.current[room.role];
        const spawnCol =
          typeof stored?.tileCol === 'number' ? stored.tileCol : Math.floor(LAYOUT_TILE_COLS / 2);
        const spawnRow =
          typeof stored?.tileRow === 'number' ? stored.tileRow : LAYOUT_TILE_ROWS - 2;
        next.push(createCharacter(room, palCount, { col: spawnCol, row: spawnRow }));
      }
    }
    // Drop tracking entries for agents that no longer exist so the map can't
    // grow unbounded across long-lived sessions.
    for (const role of arrivedAtRef.current.keys()) {
      if (!activeRoles.has(role)) arrivedAtRef.current.delete(role);
    }
    charactersRef.current = next;
    setCharacters(next);
    if (layoutRef.current) {
      assignSeats(charactersRef.current, layoutRef.current);
    }
  }, [rooms, sprites]);

  // On authoritative snapshot arrival (initial REST, first WS frame, or any
  // subsequent server-pushed snapshot): snap characters to server positions.
  // Reads from agentPositionsRef so this does NOT fire on local optimistic
  // updates, which would risk teleporting mid-walk.
  useEffect(() => {
    if (ws.snapshotNonce === 0) return;
    const positions = agentPositionsRef.current;
    for (const c of charactersRef.current) {
      const stored = positions[c.role];
      if (!stored) continue;
      const tc = typeof stored.tileCol === 'number' ? stored.tileCol : null;
      const tr = typeof stored.tileRow === 'number' ? stored.tileRow : null;
      if (tc === null || tr === null) continue;
      if (tc !== c.tileCol || tr !== c.tileRow) {
        teleportTo(c, tc, tr);
      }
    }
  }, [ws.snapshotNonce]);

  useEffect(() => {
    if (!sprites) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (!layoutRef.current) {
      layoutRef.current = createLayout(Math.max(rooms.length, 2));
      setLayout(layoutRef.current);
    }

    // Size the backing canvas to the container's pixel size; create/resize
    // the camera to match. The camera is in native-map pixel space.
    const syncSize = () => {
      const w = Math.max(1, Math.floor(container.clientWidth));
      const h = Math.max(1, Math.floor(container.clientHeight));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      if (!cameraRef.current) {
        cameraRef.current = createCamera(w, h, MAP_PIXEL_W, MAP_PIXEL_H);
      } else {
        resizeCamera(cameraRef.current, w, h, MAP_PIXEL_W, MAP_PIXEL_H);
      }
    };
    syncSize();

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(container);

    const stop = startGameLoop(canvas, {
      update: (dt) => {
        const layout = layoutRef.current;
        if (!layout) return;
        for (const c of charactersRef.current) {
          const prevState = c.state;
          updateCharacter(c, dt, {
            layout,
            characters: charactersRef.current,
            reducedMotion: reducedMotionRef.current,
          });
          // Detect "just arrived" (was WALK, now not WALK, path empty) and
          // notify the server so positions persist across restarts.
          if (
            prevState === 'walk' &&
            c.state !== 'walk' &&
            c.path.length === 0
          ) {
            const key = `${c.tileCol},${c.tileRow}`;
            if (arrivedAtRef.current.get(c.role) !== key) {
              arrivedAtRef.current.set(c.role, key);
              sendAgentUpdateRef.current(c.role, {
                tileCol: c.tileCol,
                tileRow: c.tileRow,
                dir: c.dir,
                state: c.state,
              });
            }
          }
        }
        // Pan camera to follow the cluster of characters (or map center).
        const cam = cameraRef.current;
        if (cam) {
          let tx = MAP_PIXEL_W / 2;
          let ty = MAP_PIXEL_H / 2;
          if (charactersRef.current.length > 0) {
            let sx = 0;
            let sy = 0;
            for (const c of charactersRef.current) {
              sx += c.x + 8;
              sy += c.y + 16;
            }
            tx = sx / charactersRef.current.length;
            ty = sy / charactersRef.current.length;
          }
          updateCamera(cam, tx, ty, MAP_PIXEL_W, MAP_PIXEL_H);
        }
      },
      render: (ctx) => {
        const layout = layoutRef.current;
        const cam = cameraRef.current;
        if (!layout || !sprites || !cam) return;
        render(ctx, {
          layout,
          characters: charactersRef.current,
          sprites,
          darkMode: darkModeRef.current,
          camera: cam,
        });
      },
    });
    return () => {
      ro.disconnect();
      stop();
    };
  }, [sprites, rooms.length]);

  return (
    <Page>
      <PageHeader eyebrow="Workshop" title="Pixel office">
        <span className="text-[10px] uppercase tracking-widest text-ops-muted dark:text-[#839087]">
          {rooms.length} {rooms.length === 1 ? 'agent' : 'agents'}
        </span>
      </PageHeader>

      {ws.error && !ws.connected && (
        <div className="border border-rose-500 bg-rose-50/80 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
          {ws.error}
        </div>
      )}

      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-none border border-ops-line bg-black/5 dark:border-white/15 dark:bg-white/5"
        style={{ height: 'min(70vh, 640px)' }}
      >
        <canvas
          ref={canvasRef}
          aria-label="Agent workshop office"
          className="block"
          style={{
            imageRendering: 'pixelated',
            width: '100%',
            height: '100%',
          }}
        />
        {!sprites && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-white">
            Loading sprites…
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
