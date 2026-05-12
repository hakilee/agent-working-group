"""tmux session discovery + capture-pane polling for the dashboard.

Designed as a small surface area so a future libtmux or pty-based source can
slot in without touching the router/WebSocket code:

  - `TmuxBackend.list_sessions()`     -> list[Session]
  - `TmuxBackend.capture(session, lines)` -> str

`PollingTmuxMonitor` consumes a `TmuxBackend`, broadcasts diffs over an asyncio
queue per subscriber, and can be swapped out wholesale if/when a streaming
source (libtmux pty hook, fifo, etc.) becomes available.
"""

import asyncio
import logging
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Optional


logger = logging.getLogger(__name__)

SESSION_PREFIX = "awg-"
POLL_INTERVAL_SEC = 2.0
CAPTURE_LINES = 200


@dataclass
class Window:
    index: int
    name: str
    active: bool
    panes: int
    flags: str


@dataclass
class Session:
    name: str
    created_at: int  # unix seconds
    attached: bool
    windows: int


class TmuxBackend:
    """Shells out to `tmux`. Replace with libtmux/pty backend later."""

    def __init__(self, session_prefix: str = SESSION_PREFIX):
        self.session_prefix = session_prefix

    @property
    def available(self) -> bool:
        return shutil.which("tmux") is not None

    def _run(self, *args: str, timeout: float = 5.0) -> str:
        try:
            result = subprocess.run(
                ["tmux", *args],
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            logger.warning("tmux command timed out: %s", args)
            return ""
        except OSError as exc:
            logger.warning("tmux command failed (%s): %s", args, exc)
            return ""
        if result.returncode != 0:
            logger.debug(
                "tmux %s exited %s: %s",
                args, result.returncode, result.stderr.strip()
            )
            return ""
        return result.stdout

    def list_sessions(self) -> list[Session]:
        if not self.available:
            return []
        fmt = "#{session_name}\t#{session_created}\t#{session_attached}\t#{session_windows}"
        out = self._run("list-sessions", "-F", fmt)
        sessions: list[Session] = []
        for line in out.splitlines():
            parts = line.split("\t")
            if len(parts) < 4:
                continue
            name = parts[0]
            if not name.startswith(self.session_prefix):
                continue
            try:
                sessions.append(
                    Session(
                        name=name,
                        created_at=int(parts[1] or 0),
                        attached=parts[2] not in ("0", ""),
                        windows=int(parts[3] or 0),
                    )
                )
            except ValueError:
                continue
        sessions.sort(key=lambda s: s.name)
        return sessions

    def list_windows(self, session: str) -> list[Window]:
        if not self.available:
            return []
        fmt = "#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}\t#{window_flags}"
        out = self._run("list-windows", "-t", session, "-F", fmt)
        windows: list[Window] = []
        for line in out.splitlines():
            parts = line.split("\t")
            if len(parts) < 5:
                continue
            try:
                windows.append(
                    Window(
                        index=int(parts[0]),
                        name=parts[1],
                        active=parts[2] == "1",
                        panes=int(parts[3] or 0),
                        flags=parts[4],
                    )
                )
            except ValueError:
                continue
        windows.sort(key=lambda w: w.index)
        return windows

    def capture(self, session: str, lines: int = CAPTURE_LINES, window: Optional[int] = None) -> str:
        if not self.available:
            return ""
        target = f"{session}:{window}" if window is not None else session
        # -p: print to stdout, -J: join wrapped lines, -S -N: last N lines
        return self._run("capture-pane", "-pJ", "-t", target, "-S", f"-{lines}")


class PollingTmuxMonitor:
    """Polls tmux capture-pane on an interval; broadcasts diffs to subscribers."""

    def __init__(
        self,
        backend: Optional[TmuxBackend] = None,
        interval: float = POLL_INTERVAL_SEC,
        capture_lines: int = CAPTURE_LINES,
    ):
        self.backend = backend or TmuxBackend()
        self.interval = interval
        self.capture_lines = capture_lines
        self._task: Optional[asyncio.Task] = None
        self._stopping = asyncio.Event()
        self._last_capture: dict[str, str] = {}
        self._subscribers: dict[str, set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    def list_sessions(self) -> list[Session]:
        return self.backend.list_sessions()

    def snapshot(self, target: str) -> str:
        session, window = split_target(target)
        text = self.backend.capture(session, self.capture_lines, window=window)
        self._last_capture[target] = text
        return text

    async def subscribe(self, session: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=64)
        async with self._lock:
            self._subscribers.setdefault(session, set()).add(queue)
        # Prime with current snapshot so new clients get state immediately.
        # Offload the blocking tmux call to a thread so the event loop stays free.
        snapshot = self._last_capture.get(session)
        if snapshot is None:
            snapshot = await asyncio.to_thread(self.snapshot, session)
        base_session, window = split_target(session)
        await queue.put({"type": "snapshot", "session": base_session, "window": window, "data": snapshot, "ts": time.time()})
        return queue

    async def unsubscribe(self, session: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            subs = self._subscribers.get(session)
            if subs and queue in subs:
                subs.discard(queue)
                if not subs:
                    self._subscribers.pop(session, None)
                    # Drop cached capture so the dict doesn't grow unboundedly.
                    self._last_capture.pop(session, None)

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stopping.clear()
        self._task = asyncio.create_task(self._run_loop(), name="tmux-monitor")

    async def stop(self) -> None:
        self._stopping.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("tmux monitor task raised during shutdown")
            self._task = None

    async def _run_loop(self) -> None:
        while not self._stopping.is_set():
            try:
                await self._tick()
            except Exception:
                # Never let polling crash the server — but never silently either.
                logger.exception("tmux monitor tick failed")
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=self.interval)
            except asyncio.TimeoutError:
                continue

    async def _tick(self) -> None:
        async with self._lock:
            watched = list(self._subscribers.keys())
        for target in watched:
            session, window = split_target(target)
            text = await asyncio.to_thread(
                self.backend.capture, session, self.capture_lines, window
            )
            previous = self._last_capture.get(target, "")
            if text == previous:
                continue
            self._last_capture[target] = text
            await self._broadcast(
                target,
                {
                    "type": "update",
                    "session": session,
                    "window": window,
                    "data": text,
                    "ts": time.time(),
                },
            )

    async def _broadcast(self, session: str, payload: dict) -> None:
        async with self._lock:
            subs = list(self._subscribers.get(session, ()))
        for queue in subs:
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                # Drop oldest so slow clients can't stall the poller.
                try:
                    queue.get_nowait()
                    queue.put_nowait(payload)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass


def make_target(session: str, window: Optional[int] = None) -> str:
    return f"{session}:{window}" if window is not None else session


def split_target(target: str) -> tuple[str, Optional[int]]:
    if ":" not in target:
        return target, None
    session, raw_window = target.rsplit(":", 1)
    try:
        return session, int(raw_window)
    except ValueError:
        return target, None
