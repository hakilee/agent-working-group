import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type AgentSummary } from '../api/client';
import { Page, PageHeader } from '../components/ui/page';
import { useQueueStream } from '../hooks/use-queue-stream';
import { deriveRooms } from '../workshop/room-state';
import type { AgentRoom } from '../workshop/types';
import {
  LAYOUT_TILE_COLS,
  LAYOUT_TILE_ROWS,
  TILE_SIZE,
  applyRoomState,
  assignSeats,
  createCharacter,
  createLayout,
  loadSprites,
  render,
  startGameLoop,
  updateCharacter,
  type EngineCharacter,
  type OfficeLayout,
  type SpriteManager,
} from '../workshop/engine';

const CANVAS_W = LAYOUT_TILE_COLS * TILE_SIZE;
const CANVAS_H = LAYOUT_TILE_ROWS * TILE_SIZE;

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
  const stream = useQueueStream();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sprites, setSprites] = useState<SpriteManager | null>(null);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    api
      .listQueues()
      .then((data) => {
        if (!cancelled) setAgents(data.agents ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Stream updates
  useEffect(() => {
    const streamAgents = stream.data?.agents;
    if (streamAgents && streamAgents.length > 0) {
      setAgents(streamAgents);
      setError(null);
    }
  }, [stream.data]);

  // Load sprites once
  useEffect(() => {
    let cancelled = false;
    loadSprites().then((mgr) => {
      if (!cancelled) setSprites(mgr);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rooms = useMemo(() => deriveRooms(agents), [agents]);

  // Mutable refs for the loop
  const layoutRef = useRef<OfficeLayout | null>(null);
  const charactersRef = useRef<EngineCharacter[]>([]);
  const roomsRef = useRef<AgentRoom[]>(rooms);
  const darkModeRef = useRef<boolean>(detectDarkMode());
  const reducedMotionRef = useRef<boolean>(detectReducedMotion());

  // Watch theme changes (re-evaluate dark mode each frame is cheap, but keep ref updated via observer).
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
    if (!sprites) return;
    const palCount = Math.max(sprites.characters.length, 1);
    const needed = rooms.length;

    if (!layoutRef.current || layoutRef.current.seats.length < needed) {
      layoutRef.current = createLayout(needed);
    }

    const existing = new Map(charactersRef.current.map((c) => [c.role, c]));
    const next: EngineCharacter[] = [];
    for (const room of rooms) {
      const found = existing.get(room.role);
      if (found) {
        applyRoomState(found, room);
        next.push(found);
      } else {
        // Spawn at a doorway-ish tile (centered along the bottom wall, just inside).
        const spawnCol = Math.floor(LAYOUT_TILE_COLS / 2);
        const spawnRow = LAYOUT_TILE_ROWS - 2;
        next.push(createCharacter(room, palCount, { col: spawnCol, row: spawnRow }));
      }
    }
    charactersRef.current = next;
    if (layoutRef.current) {
      assignSeats(charactersRef.current, layoutRef.current);
    }
  }, [rooms, sprites]);

  // Main loop
  useEffect(() => {
    if (!sprites) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    if (!layoutRef.current) {
      layoutRef.current = createLayout(Math.max(rooms.length, 2));
    }

    const stop = startGameLoop(canvas, {
      update: (dt) => {
        const layout = layoutRef.current;
        if (!layout) return;
        for (const c of charactersRef.current) {
          updateCharacter(c, dt, {
            layout,
            characters: charactersRef.current,
            reducedMotion: reducedMotionRef.current,
          });
        }
      },
      render: (ctx) => {
        const layout = layoutRef.current;
        if (!layout || !sprites) return;
        render(ctx, {
          layout,
          characters: charactersRef.current,
          sprites,
          darkMode: darkModeRef.current,
        });
      },
    });
    return stop;
  }, [sprites]);

  return (
    <Page>
      <PageHeader eyebrow="Workshop" title="Pixel office">
        <span className="text-[10px] uppercase tracking-widest text-ops-muted dark:text-[#839087]">
          {rooms.length} {rooms.length === 1 ? 'agent' : 'agents'}
        </span>
      </PageHeader>

      {error && (
        <div className="border border-rose-500 bg-rose-50/80 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="relative overflow-hidden rounded-none border border-ops-line bg-black/5 dark:border-white/15 dark:bg-white/5">
        <canvas
          ref={canvasRef}
          aria-label="Agent workshop office"
          className="block w-full"
          style={{
            imageRendering: 'pixelated',
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            height: 'auto',
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
