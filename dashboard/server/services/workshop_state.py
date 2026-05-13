"""Server-side workshop state manager.

Maintains per-agent position/state in memory. Clients sync via REST (initial
load) and WebSocket (live updates). State survives client disconnects because
it lives in the server process — navigating away and back just reconnects.

Layout is deterministic (derived from agent count), so we only persist the
*dynamic* parts: agent positions, directions, and animation states.
"""

import json
import logging
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

STATE_FILE_NAME = "workshop-state.json"


class WorkshopState:
    """In-memory workshop state backed by an optional JSON file."""

    def __init__(self, root: Optional[Path] = None) -> None:
        self._root = root
        self._agents: dict[str, dict[str, Any]] = {}
        self._layout_version: int = 0
        self._last_save: float = 0.0
        self._load()

    # ── Public API ────────────────────────────────────────────────

    def get_snapshot(self) -> dict[str, Any]:
        """Return the full workshop state for REST/WebSocket delivery."""
        return {
            "type": "workshop",
            "agents": dict(self._agents),
            "layoutVersion": self._layout_version,
            "ts": time.time(),
        }

    def update_agent(self, role: str, data: dict[str, Any]) -> None:
        """Merge incoming agent state. Called from WebSocket messages."""
        existing = self._agents.get(role, {})
        existing.update(data)
        existing["updatedAt"] = time.time()
        self._agents[role] = existing
        self._maybe_save()

    def remove_agent(self, role: str) -> None:
        self._agents.pop(role, None)
        self._maybe_save()

    def set_layout_version(self, version: int) -> None:
        self._layout_version = version

    # ── Persistence ───────────────────────────────────────────────

    def _state_path(self) -> Optional[Path]:
        if self._root:
            return self._root / STATE_FILE_NAME
        return None

    def _load(self) -> None:
        path = self._state_path()
        if not path or not path.is_file():
            return
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            self._agents = data.get("agents", {})
            self._layout_version = data.get("layoutVersion", 0)
            logger.info("loaded workshop state from %s (%d agents)", path, len(self._agents))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("failed to load workshop state: %s", exc)

    def _maybe_save(self) -> None:
        """Throttled save — at most once per 2 seconds."""
        now = time.time()
        if now - self._last_save < 2.0:
            return
        self._last_save = now
        path = self._state_path()
        if not path:
            return
        try:
            with path.open("w", encoding="utf-8") as f:
                json.dump(
                    {
                        "agents": self._agents,
                        "layoutVersion": self._layout_version,
                    },
                    f,
                    indent=2,
                )
        except OSError as exc:
            logger.warning("failed to save workshop state: %s", exc)
