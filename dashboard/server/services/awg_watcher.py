"""Filesystem watcher for AWG queue + heartbeat events.

A single background task polls the AWG root for changes on a short interval and
fans out snapshots to two channels: `queues` (queue counts and per-agent change
hints) and `liveness` (heartbeat / timeout / contract snapshots).

The implementation uses directory-listing + mtime checks rather than
inotify/watchfiles so it works uniformly on macOS, Linux, and container
filesystems without a binary dependency. The poll interval is conservative
(1s) — small enough to feel real-time, large enough to keep CPU at idle.
"""

import asyncio
import logging
import time
from typing import Any, Optional

from agent_working_group.timeout import (
    DEFAULT_PROCESSING_TIMEOUT_SEC,
    TimeoutChecker,
)

from .awg_reader import AwgReader, QUEUE_STATES
from .heartbeat_reader import HeartbeatReader, default_heartbeat_timeout


logger = logging.getLogger(__name__)

POLL_INTERVAL_SEC = 1.0


def _queues_signature(reader: AwgReader) -> tuple:
    """Cheap fingerprint of the queue tree.

    We never read message contents here — only the directory mtimes and child
    counts — so this is O(agents * states) regardless of queue depth.
    """
    base = reader.queues_dir()
    if not base.is_dir():
        return tuple()
    sig: list[tuple] = []
    for agent in reader.agents():
        for state in QUEUE_STATES:
            directory = base / agent / state
            if not directory.is_dir():
                sig.append((agent, state, 0, 0.0))
                continue
            try:
                mtime = directory.stat().st_mtime
            except OSError:
                mtime = 0.0
            count = sum(1 for path in directory.glob("*.json") if path.is_file())
            sig.append((agent, state, count, mtime))
    return tuple(sig)


def _heartbeats_signature(root) -> tuple:
    heartbeats_dir = root / "heartbeats"
    if not heartbeats_dir.is_dir():
        return tuple()
    sig: list[tuple] = []
    for agent_dir in sorted(heartbeats_dir.iterdir()):
        if not agent_dir.is_dir():
            continue
        for ts_file in sorted(agent_dir.glob("*.ts")):
            try:
                mtime = ts_file.stat().st_mtime
            except OSError:
                mtime = 0.0
            sig.append((agent_dir.name, ts_file.name, mtime))
    return tuple(sig)


def _build_queues_payload(reader: AwgReader) -> dict[str, Any]:
    return {
        "type": "queues",
        "root": str(reader.root),
        "agents": reader.agents_summary(),
        "counts": reader.counts(),
        "ts": time.time(),
    }


def _build_liveness_payload(
    reader: AwgReader,
    heartbeats: HeartbeatReader,
    checker: TimeoutChecker,
    *,
    processing_timeout: int,
    heartbeat_timeout: int,
) -> dict[str, Any]:
    entries = heartbeats.list_heartbeats(timeout_seconds=heartbeat_timeout)
    counts = {"fresh": 0, "stale": 0, "missing": 0}
    for entry in entries:
        counts[entry.status] = counts.get(entry.status, 0) + 1
    stale = checker.stale_processing(timeout_seconds=processing_timeout)
    breaches = checker.response_contract_breaches()
    return {
        "type": "liveness",
        "heartbeats": {
            "items": [entry.to_dict() for entry in entries],
            "counts": counts,
            "total": len(entries),
        },
        "timeouts": {
            "items": [item.to_dict() for item in stale],
            "total": len(stale),
            "timeoutSeconds": processing_timeout,
        },
        "contracts": {
            "items": [breach.to_dict() for breach in breaches],
            "total": len(breaches),
        },
        "ts": time.time(),
    }


class AwgWatcher:
    """Poll the AWG filesystem and broadcast change snapshots."""

    def __init__(
        self,
        reader: AwgReader,
        *,
        interval: float = POLL_INTERVAL_SEC,
        processing_timeout: int = DEFAULT_PROCESSING_TIMEOUT_SEC,
        heartbeat_timeout: Optional[int] = None,
    ) -> None:
        self.reader = reader
        self.heartbeats = HeartbeatReader(reader.root)
        self.checker = TimeoutChecker(reader.root)
        self.interval = interval
        self.processing_timeout = processing_timeout
        self.heartbeat_timeout = heartbeat_timeout or default_heartbeat_timeout()
        self._task: Optional[asyncio.Task] = None
        self._stopping = asyncio.Event()
        self._lock = asyncio.Lock()
        self._subscribers: dict[str, set[asyncio.Queue]] = {
            "queues": set(),
            "liveness": set(),
        }
        self._last_queues_sig: tuple = ()
        self._last_liveness_sig: tuple = ()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stopping.clear()
        self._task = asyncio.create_task(self._run_loop(), name="awg-watcher")

    async def stop(self) -> None:
        self._stopping.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("awg watcher raised during shutdown")
            self._task = None

    async def subscribe(self, channel: str) -> asyncio.Queue:
        if channel not in self._subscribers:
            raise ValueError(f"unknown channel: {channel}")
        queue: asyncio.Queue = asyncio.Queue(maxsize=32)
        async with self._lock:
            self._subscribers[channel].add(queue)
        # Prime new subscribers with the current snapshot so they don't have to
        # wait for the next change to render.
        if channel == "queues":
            payload = await asyncio.to_thread(_build_queues_payload, self.reader)
        else:
            payload = await asyncio.to_thread(
                _build_liveness_payload,
                self.reader,
                self.heartbeats,
                self.checker,
                processing_timeout=self.processing_timeout,
                heartbeat_timeout=self.heartbeat_timeout,
            )
        await queue.put(payload)
        return queue

    async def unsubscribe(self, channel: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            subs = self._subscribers.get(channel)
            if subs and queue in subs:
                subs.discard(queue)

    def _has_subscribers(self, channel: str) -> bool:
        return bool(self._subscribers.get(channel))

    async def _run_loop(self) -> None:
        while not self._stopping.is_set():
            try:
                await self._tick()
            except Exception:
                logger.exception("awg watcher tick failed")
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=self.interval)
            except asyncio.TimeoutError:
                continue

    async def _tick(self) -> None:
        if self._has_subscribers("queues"):
            sig = await asyncio.to_thread(_queues_signature, self.reader)
            if sig != self._last_queues_sig:
                self._last_queues_sig = sig
                payload = await asyncio.to_thread(_build_queues_payload, self.reader)
                await self._broadcast("queues", payload)
        if self._has_subscribers("liveness"):
            # Rebuild liveness every tick — timeout/contract status advances
            # with wall-clock time even when no file changes.
            payload = await asyncio.to_thread(
                _build_liveness_payload,
                self.reader,
                self.heartbeats,
                self.checker,
                processing_timeout=self.processing_timeout,
                heartbeat_timeout=self.heartbeat_timeout,
            )
            await self._broadcast("liveness", payload)

    async def _broadcast(self, channel: str, payload: dict) -> None:
        async with self._lock:
            subs = list(self._subscribers.get(channel, ()))
        for queue in subs:
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                # Drop oldest so a stalled client can't back up the watcher.
                try:
                    queue.get_nowait()
                    queue.put_nowait(payload)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass
