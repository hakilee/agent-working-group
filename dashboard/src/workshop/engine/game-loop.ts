export interface GameLoopCallbacks {
  update: (dt: number) => void;
  render: (ctx: CanvasRenderingContext2D) => void;
}

export function startGameLoop(
  canvas: HTMLCanvasElement,
  callbacks: GameLoopCallbacks,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  // Canvas dimensions are managed by the caller (ResizeObserver in React effect).
  ctx.imageSmoothingEnabled = false;

  let last = performance.now();
  let raf = 0;
  let stopped = false;

  const tick = (now: number) => {
    if (stopped) return;
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(rawDt, 0.1);
    callbacks.update(dt);
    ctx.imageSmoothingEnabled = false;
    callbacks.render(ctx);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
