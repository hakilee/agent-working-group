
import os
import time

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/status", tags=["status"])


@router.get("")
def system_status(request: Request) -> dict:
    reader = request.app.state.awg_reader
    monitor = request.app.state.tmux_monitor

    # Single scan: iter_items once, derive both counts and lookup
    all_items = reader.iter_items()
    current_items = {item.id: item for item in all_items}
    from services.awg_reader import STATE_TO_PUBLIC
    counts = {public: 0 for public in STATE_TO_PUBLIC.values()}
    for item in all_items:
        counts[item.state] = counts.get(item.state, 0) + 1

    sessions = monitor.list_sessions()
    recent = reader.recent_log(limit=20)

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
    queue_path_exists = reader.queues_dir().is_dir()
    is_tmp_root = str(root).startswith("/tmp/")
    tmux_available = monitor.backend.available
    dist_dir = getattr(request.app.state, "dashboard_dist_dir", None)
    dist_exists = dist_dir.is_dir() if dist_dir is not None else None
    index_exists = (dist_dir / "index.html").is_file() if dist_dir is not None else None
    assets_exists = (dist_dir / "assets").is_dir() if dist_dir is not None else None
    issues = []
    if not queue_path_exists:
        issues.append("queue path is missing")
    if is_tmp_root:
        issues.append("dashboard is using a temporary AWG root")
    if not tmux_available:
        issues.append("tmux is unavailable to the dashboard process")
    if dist_exists is False:
        issues.append("dashboard dist directory is missing")
    elif index_exists is False:
        issues.append("dashboard dist index.html is missing")
    if dist_exists and assets_exists is False:
        issues.append("dashboard dist assets directory is missing")

    return {
        "root": str(root),
        "rootSource": "env" if (os.environ.get("DASHBOARD_ROOT") or os.environ.get("AWG_ROOT")) else "auto",
        "queuePath": str(reader.queues_dir()),
        "queuePathExists": queue_path_exists,
        "isTmpRoot": is_tmp_root,
        "distPath": str(dist_dir) if dist_dir is not None else None,
        "distPathExists": dist_exists,
        "staticAssetsExist": assets_exists,
        "readiness": {
            "ok": not issues,
            "level": "ok" if not issues else "degraded",
            "issues": issues,
        },
        "counts": counts,
        "totalQueueItems": sum(counts.values()),
        "agents": reader.agents(),
        "workers": {
            "total": len(sessions),
            "attached": sum(1 for s in sessions if s.attached),
            "tmuxAvailable": tmux_available,
        },
        "recentActivity": activity,
        "serverTime": time.time(),
    }
