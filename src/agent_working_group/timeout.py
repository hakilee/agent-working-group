"""Read-only liveness checks over queue processing/ directories."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from .queue import default_root, parse_filename, read_json

DEFAULT_PROCESSING_TIMEOUT_SEC = 600


@dataclass(frozen=True)
class StaleItem:
    agent: str
    message_id: str
    file: str
    age_seconds: int
    timeout_seconds: int
    timestamp_source: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent": self.agent,
            "messageId": self.message_id,
            "file": self.file,
            "ageSeconds": self.age_seconds,
            "timeoutSeconds": self.timeout_seconds,
            "timestampSource": self.timestamp_source,
        }


@dataclass(frozen=True)
class ContractBreach:
    agent: str
    message_id: str
    file: str
    location: str
    expected_seconds: int
    actual_seconds: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent": self.agent,
            "messageId": self.message_id,
            "file": self.file,
            "location": self.location,
            "expectedSeconds": self.expected_seconds,
            "actualSeconds": self.actual_seconds,
        }


def _message_processing_since_ms(message: dict, path: Path) -> tuple[int, str]:
    """Return (epoch_ms, source-label) for when the item entered processing."""
    refs = message.get("refs") or {}
    explicit = refs.get("processingSince") or message.get("processingSince")
    if isinstance(explicit, (int, float)) and explicit > 0:
        return int(explicit), "processingSince"
    received_ms = refs.get("receivedAtMs")
    if isinstance(received_ms, (int, float)) and received_ms > 0:
        return int(received_ms), "refs.receivedAtMs"
    try:
        mtime = path.stat().st_mtime
        return int(mtime * 1000), "mtime"
    except OSError:
        ts = parse_filename(path)[1]
        return int(ts), "filename"


def _message_send_ms(message: dict, path: Path) -> tuple[int, str]:
    """Return (epoch_ms, source-label) for when the item was sent."""
    created = message.get("createdAtMs")
    if isinstance(created, (int, float)) and created > 0:
        return int(created), "createdAtMs"
    ts = parse_filename(path)[1]
    if ts:
        return int(ts), "filename"
    try:
        return int(path.stat().st_mtime * 1000), "mtime"
    except OSError:
        return 0, "unknown"


class TimeoutChecker:
    """Inspect queue processing/ and inbox/ for stale items and contract breaches.

    All methods are read-only: nothing is moved, written, or deleted.
    """

    def __init__(self, root: Path | str | None = None, *, now: float | None = None) -> None:
        self.root = Path(root).expanduser() if root else default_root()
        self._now = now

    def _current_time(self) -> float:
        return self._now if self._now is not None else time.time()

    def _agents(self) -> list[str]:
        queues_dir = self.root / "queues"
        if not queues_dir.exists():
            return []
        return sorted(path.name for path in queues_dir.iterdir() if path.is_dir())

    def _iter_processing_files(self, agent: str) -> Iterable[Path]:
        processing = self.root / "queues" / agent / "processing"
        if not processing.is_dir():
            return []
        return sorted(path for path in processing.glob("*.json") if path.is_file())

    def _iter_inbox_files(self, agent: str) -> Iterable[Path]:
        inbox = self.root / "queues" / agent / "inbox"
        if not inbox.is_dir():
            return []
        return sorted(path for path in inbox.glob("*.json") if path.is_file())

    def stale_processing(self, timeout_seconds: int = DEFAULT_PROCESSING_TIMEOUT_SEC) -> list[StaleItem]:
        stale: list[StaleItem] = []
        now_ms = int(self._current_time() * 1000)
        for agent in self._agents():
            for path in self._iter_processing_files(agent):
                try:
                    message = read_json(path)
                except json.JSONDecodeError:
                    continue
                since_ms, source = _message_processing_since_ms(message, path)
                age_seconds = max(0, (now_ms - since_ms) // 1000)
                if age_seconds > timeout_seconds:
                    stale.append(
                        StaleItem(
                            agent=agent,
                            message_id=str(message.get("id", "")),
                            file=path.name,
                            age_seconds=int(age_seconds),
                            timeout_seconds=int(timeout_seconds),
                            timestamp_source=source,
                        )
                    )
        return stale

    def response_contract_breaches(self) -> list[ContractBreach]:
        breaches: list[ContractBreach] = []
        now_ms = int(self._current_time() * 1000)
        for agent in self._agents():
            for location, paths in (
                ("inbox", self._iter_inbox_files(agent)),
                ("processing", self._iter_processing_files(agent)),
            ):
                for path in paths:
                    try:
                        message = read_json(path)
                    except json.JSONDecodeError:
                        continue
                    expected = message.get("expectedResponseWithin")
                    if not isinstance(expected, (int, float)) or expected <= 0:
                        continue
                    sent_ms, _ = _message_send_ms(message, path)
                    actual_seconds = max(0, (now_ms - sent_ms) // 1000)
                    if actual_seconds > int(expected):
                        breaches.append(
                            ContractBreach(
                                agent=agent,
                                message_id=str(message.get("id", "")),
                                file=path.name,
                                location=location,
                                expected_seconds=int(expected),
                                actual_seconds=int(actual_seconds),
                            )
                        )
        return breaches
