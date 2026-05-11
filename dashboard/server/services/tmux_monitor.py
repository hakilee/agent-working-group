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
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from typing import Optional, Awaitable, Callable, Iterable


SESSION_PREFIX = "awg-"
POLL_INTERVAL_SEC = 2.0
CAPTURE_LINES = 200


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
        except (OSError, subprocess.TimeoutExpired):
            return ""
        if result.returncode != 0:
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

    def capture(self, session: str, lines: int = CAPTURE_LINES) -> str:
        if not self.available:
            return ""
        # -p: print to stdout, -J: join wrapped lines, -S -N: last N lines
        return self._run("capture-pane", "-pJ", "-t", session, "-S", f"-{lines}")


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
        self._task: asyncio.Optional[Task] = None
        self._stopping = asyncio.Event()
        self._last_capture: dict[str, str] = {}
        self._subscribers: dict[str, set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    def list_sessions(self) -> list[Session]:
        return self.backend.list_sessions()

    def snapshot(self, session: str) -> str:
        text = self.backend.capture(session, self.capture_lines)
        self._last_capture[session] = text
        return text

    async def subscribe(self, session: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=64)
        async with self._lock:
            self._subscribers.setdefault(session, set()).add(queue)
        # Prime with current snapshot so new clients get state immediately.
        snapshot = self._last_capture.get(session) or self.snapshot(session)
        await queue.put({"type": "snapshot", "session": session, "data": snapshot, "ts": time.time()})
        return queue

    async def unsubscribe(self, session: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            subs = self._subscribers.get(session)
            if subs and queue in subs:
                subs.discard(queue)
                if not subs:
                    self._subscribers.pop(session, None)

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
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    async def _run_loop(self) -> None:
        while not self._stopping.is_set():
            try:
                await self._tick()
            except Exception:
                # Never let polling crash the server.
                pass
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=self.interval)
            except asyncio.TimeoutError:
                continue

    async def _tick(self) -> None:
        async with self._lock:
            watched = list(self._subscribers.keys())
        for session in watched:
            text = await asyncio.to_thread(
                self.backend.capture, session, self.capture_lines
            )
            previous = self._last_capture.get(session, "")
            if text == previous:
                continue
            self._last_capture[session] = text
            await self._broadcast(
                session,
                {
                    "type": "update",
                    "session": session,
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
