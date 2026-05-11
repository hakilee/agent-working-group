"""Read-only view of $AWG_ROOT/heartbeats/ for the dashboard.

Mirrors the on-disk layout that `agent_working_group.cli` writes:

    {AWG_ROOT}/
      heartbeats/
        {agent}/
          {session}.ts   <- single line: epoch-seconds integer

A heartbeat is `fresh` if `now - ts <= timeout_seconds`, `stale` if the
timestamp is older or unparseable, and an agent is `missing` if it has
items in `queues/{agent}/processing/` but no heartbeat file.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Union


logger = logging.getLogger(__name__)

DEFAULT_HEARTBEAT_TIMEOUT_SEC = 300


def default_heartbeat_timeout() -> int:
    raw = os.environ.get("WORKER_HEARTBEAT_TIMEOUT")
    if not raw:
        return DEFAULT_HEARTBEAT_TIMEOUT_SEC
    try:
        return max(1, int(raw))
    except ValueError:
        return DEFAULT_HEARTBEAT_TIMEOUT_SEC


@dataclass(frozen=True)
class HeartbeatEntry:
    agent: str
    session: str
    status: str  # fresh | stale | missing
    timestamp: Optional[int]
    age_seconds: Optional[int]
    timeout_seconds: int

    def to_dict(self) -> dict:
        return {
            "agent": self.agent,
            "session": self.session,
            "status": self.status,
            "timestamp": self.timestamp,
            "ageSeconds": self.age_seconds,
            "timeoutSeconds": self.timeout_seconds,
        }


class HeartbeatReader:
    def __init__(self, root: Union[Path, str], *, now: Optional[float] = None) -> None:
        self.root = Path(root).expanduser()
        self._now = now

    def _current_time(self) -> int:
        return int(self._now if self._now is not None else time.time())

    def _heartbeats_dir(self) -> Path:
        return self.root / "heartbeats"

    def _queues_dir(self) -> Path:
        return self.root / "queues"

    def list_heartbeats(
        self, *, timeout_seconds: Optional[int] = None
    ) -> list[HeartbeatEntry]:
        timeout = int(timeout_seconds or default_heartbeat_timeout())
        now = self._current_time()
        entries: list[HeartbeatEntry] = []
        seen_agents: set[str] = set()

        heartbeats_dir = self._heartbeats_dir()
        if heartbeats_dir.is_dir():
            for agent_dir in sorted(heartbeats_dir.iterdir()):
                if not agent_dir.is_dir():
                    continue
                seen_agents.add(agent_dir.name)
                for ts_file in sorted(agent_dir.glob("*.ts")):
                    if not ts_file.is_file():
                        continue
                    session = ts_file.stem
                    timestamp = _parse_timestamp(ts_file)
                    if timestamp is None:
                        entries.append(
                            HeartbeatEntry(
                                agent=agent_dir.name,
                                session=session,
                                status="stale",
                                timestamp=None,
                                age_seconds=None,
                                timeout_seconds=timeout,
                            )
                        )
                        continue
                    age = max(0, now - timestamp)
                    status = "stale" if age > timeout else "fresh"
                    entries.append(
                        HeartbeatEntry(
                            agent=agent_dir.name,
                            session=session,
                            status=status,
                            timestamp=timestamp,
                            age_seconds=age,
                            timeout_seconds=timeout,
                        )
                    )

        # Agents with in-flight processing items but no heartbeat file at all.
        queues_dir = self._queues_dir()
        if queues_dir.is_dir():
            for agent_dir in sorted(queues_dir.iterdir()):
                if not agent_dir.is_dir():
                    continue
                processing = agent_dir / "processing"
                if not processing.is_dir():
                    continue
                if not any(processing.glob("*.json")):
                    continue
                agent_heartbeat_dir = heartbeats_dir / agent_dir.name
                if (
                    agent_heartbeat_dir.is_dir()
                    and any(agent_heartbeat_dir.glob("*.ts"))
                ):
                    continue
                entries.append(
                    HeartbeatEntry(
                        agent=agent_dir.name,
                        session="",
                        status="missing",
                        timestamp=None,
                        age_seconds=None,
                        timeout_seconds=timeout,
                    )
                )
        return entries


def _parse_timestamp(path: Path) -> Optional[int]:
    try:
        raw = path.read_text(encoding="utf-8").strip().splitlines()
    except OSError as exc:
        logger.warning("could not read heartbeat file %s: %s", path, exc)
        return None
    if not raw:
        return None
    first = raw[0].strip()
    if not first.isdigit():
        return None
    return int(first)
