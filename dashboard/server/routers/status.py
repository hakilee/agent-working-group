
import time

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/status", tags=["status"])


@router.get("")
def system_status(request: Request) -> dict:
    reader = request.app.state.awg_reader
    monitor = request.app.state.tmux_monitor

    counts = reader.counts()
    sessions = monitor.list_sessions()
    recent = reader.recent_log(limit=20)

    activity = [
        {
            "id": entry.get("id"),
            "kind": entry.get("kind"),
            "from": entry.get("from"),
            "to": entry.get("to"),
            "body": (entry.get("body") or "")[:200],
            "createdAt": entry.get("createdAt"),
            "createdAtMs": entry.get("createdAtMs"),
        }
        for entry in recent
    ]

    return {
        "root": str(reader.root),
        "counts": counts,
        "totalQueueItems": sum(counts.values()),
        "agents": reader.agents(),
        "workers": {
            "total": len(sessions),
            "attached": sum(1 for s in sessions if s.attached),
            "tmuxAvailable": monitor.backend.available,
        },
        "recentActivity": activity,
        "serverTime": time.time(),
    }
