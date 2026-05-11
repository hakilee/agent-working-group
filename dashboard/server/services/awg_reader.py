"""Filesystem reader for AWG queue state.

Parses the on-disk layout produced by `agent_working_group.MessageQueue`:

    {AWG_ROOT}/
      queues/
        {agent}/
          inbox/          *.json  (pending)
          processing/     *.json  (in-flight, awaiting ack)
          processed/      *.json  (completed)
          dead/           *.json  (gave up)
      log/messages.jsonl

Filenames follow `{createdAtMs:013d}_{priority:02d}_{shortId}.json`.
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Iterable, Union

QUEUE_STATES = ("inbox", "processing", "processed", "dead")
STATE_TO_PUBLIC = {
    "inbox": "pending",
    "processing": "processing",
    "processed": "processed",
    "dead": "dead",
}


def default_root() -> Path:
    """Resolve the AWG root directory. Honors AWG_ROOT, defaults to /tmp/awg-ops."""
    return Path(os.environ.get("AWG_ROOT", "/tmp/awg-ops")).expanduser()


@dataclass
class QueueItem:
    id: str
    agent: str
    state: str  # "pending" | "processing" | "processed" | "dead"
    kind: str
    sender: Optional[str]
    recipient: Optional[str]
    priority: int
    created_at: Optional[str]
    created_at_ms: Optional[int]
    body: str
    refs: dict
    filename: str
    raw: dict = field(default_factory=dict)

    def to_summary(self) -> dict:
        return {
            "id": self.id,
            "agent": self.agent,
            "state": self.state,
            "kind": self.kind,
            "from": self.sender,
            "to": self.recipient,
            "priority": self.priority,
            "createdAt": self.created_at,
            "createdAtMs": self.created_at_ms,
            "body": self.body[:280],
            "filename": self.filename,
        }

    def to_detail(self) -> dict:
        return {
            **self.to_summary(),
            "body": self.body,
            "refs": self.refs,
            "message": self.raw,
        }


def _parse_filename(name: str) -> tuple[int, int]:
    parts = name.split("_", 2)
    try:
        return int(parts[0]), int(parts[1])
    except (IndexError, ValueError):
        return 0, 0


def _read_json(path: Path) -> Optional[dict]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None


def _build_item(path: Path, agent: str, state_dir: str) -> Optional[QueueItem]:
    data = _read_json(path)
    if data is None:
        return None
    created_ms, priority = _parse_filename(path.name)
    return QueueItem(
        id=str(data.get("id") or path.stem),
        agent=agent,
        state=STATE_TO_PUBLIC[state_dir],
        kind=str(data.get("kind", "unknown")),
        sender=data.get("from"),
        recipient=data.get("to"),
        priority=int(data.get("priority", priority)),
        created_at=data.get("createdAt"),
        created_at_ms=int(data.get("createdAtMs", created_ms)) or created_ms,
        body=str(data.get("body", "")),
        refs=dict(data.get("refs") or {}),
        filename=path.name,
        raw=data,
    )


class AwgReader:
    def __init__(self, root: Optional[Union[Path, str]] = None):
        self.root = Path(root).expanduser() if root else default_root()

    def queues_dir(self) -> Path:
        return self.root / "queues"

    def agents(self) -> list[str]:
        base = self.queues_dir()
        if not base.is_dir():
            return []
        return sorted(p.name for p in base.iterdir() if p.is_dir())

    def iter_items(self, states: Iterable[str] = QUEUE_STATES) -> list[QueueItem]:
        items: list[QueueItem] = []
        for agent in self.agents():
            for state_dir in states:
                directory = self.queues_dir() / agent / state_dir
                if not directory.is_dir():
                    continue
                for path in directory.glob("*.json"):
                    if not path.is_file():
                        continue
                    item = _build_item(path, agent, state_dir)
                    if item is not None:
                        items.append(item)
        return items

    def list_items(
        self,
        state: Optional[str] = None,
        agent: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> list[QueueItem]:
        items = self.iter_items()
        if state:
            items = [item for item in items if item.state == state]
        if agent:
            items = [item for item in items if item.agent == agent]
        items.sort(
            key=lambda it: (it.created_at_ms or 0),
            reverse=True,
        )
        if limit is not None:
            items = items[:limit]
        return items

    def find(self, item_id: str) -> Optional[QueueItem]:
        for item in self.iter_items():
            if item.id == item_id or item.filename.startswith(item_id):
                return item
        return None

    def counts(self) -> dict[str, int]:
        counts = {public: 0 for public in STATE_TO_PUBLIC.values()}
        for item in self.iter_items():
            counts[item.state] = counts.get(item.state, 0) + 1
        return counts

    def recent_log(self, limit: int = 50) -> list[dict]:
        log_path = self.root / "log" / "messages.jsonl"
        if not log_path.is_file():
            return []
        try:
            with log_path.open("r", encoding="utf-8") as handle:
                lines = handle.readlines()
        except OSError:
            return []
        out: list[dict] = []
        for line in lines[-limit:][::-1]:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return out
