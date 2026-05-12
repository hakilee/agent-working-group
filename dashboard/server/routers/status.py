
import os
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
    current_items = {item.id: item for item in reader.iter_items()}

    activity = []
    for entry in recent:
        current = current_items.get(str(entry.get("id")))
        activity.append(
            {
                "id": entry.get("id"),
                "state": current.state if current else "logged",
                "agent": current.agent if current else entry.get("to"),
                "kind": entry.get("kind"),
                "from": entry.get("from"),
                "to": entry.get("to"),
                "body": (entry.get("body") or "")[:200],
                "createdAt": entry.get("createdAt"),
                "createdAtMs": entry.get("createdAtMs"),
            }
        )

    root = reader.root
    return {
        "root": str(root),
        "rootSource": "env" if (os.environ.get("DASHBOARD_ROOT") or os.environ.get("AWG_ROOT")) else "auto",
        "queuePath": str(reader.queues_dir()),
        "queuePathExists": reader.queues_dir().is_dir(),
        "isTmpRoot": str(root).startswith("/tmp/"),
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
