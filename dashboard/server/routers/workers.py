from typing import Optional

import asyncio
import re
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from agent_working_group import MessageQueue
from services.tmux_monitor import make_target

router = APIRouter(tags=["workers"])

# tmux session names we accept: the awg- prefix plus identifier chars only.
# This blocks names that would confuse tmux's flag parsing (e.g., `-X`) and
# any path/shell-meaningful characters even though we already use argv (no shell).
_SESSION_NAME_RE = re.compile(r"^awg-[A-Za-z0-9_.-]{1,64}$")
_QUEUE_ROLE_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
_WINDOW_INDEX_RE = re.compile(r"^[0-9]{1,3}$")


class WorkerActionRequest(BaseModel):
    action: str
    target: str = "lead"
    reason: Optional[str] = None
    window: Optional[int] = None


def _require_valid_session(session_name: str) -> None:
    if not _SESSION_NAME_RE.fullmatch(session_name):
        raise HTTPException(status_code=400, detail="invalid session name")


def _require_valid_window(window: int) -> None:
    if window < 0 or window > 999:
        raise HTTPException(status_code=400, detail="invalid window index")


def _require_valid_queue_target(target: str, root: Path) -> None:
    if not _QUEUE_ROLE_RE.fullmatch(target):
        raise HTTPException(status_code=400, detail="invalid queue target")
    queue_root = (root / "queues").resolve()
    target_path = (queue_root / target).resolve()
    if target_path != queue_root and queue_root not in target_path.parents:
        raise HTTPException(status_code=400, detail="invalid queue target")


def _window_payload(window) -> dict:
    return {
        "index": window.index,
        "name": window.name,
        "active": window.active,
        "panes": window.panes,
        "flags": window.flags,
    }


def _session_payload(session, *, windows: Optional[list] = None, capture: Optional[str] = None) -> dict:
    uptime = max(0, int(time.time()) - int(session.created_at)) if session.created_at else None
    payload = {
        "session": session.name,
        "createdAt": session.created_at,
        "uptimeSeconds": uptime,
        "attached": session.attached,
        "windows": session.windows,
        "windowItems": [_window_payload(w) for w in windows] if windows is not None else [],
        "status": "attached" if session.attached else "running",
    }
    if capture is not None:
        payload["recentOutput"] = capture
    return payload


def _find_session(monitor, session_name: str):
    sessions = {s.name: s for s in monitor.list_sessions()}
    session = sessions.get(session_name)
    if session is None:
        raise HTTPException(status_code=404, detail="worker session not found")
    return session


@router.get("/api/workers")
def list_workers(request: Request) -> dict:
    monitor = request.app.state.tmux_monitor
    sessions = monitor.list_sessions()
    return {
        "items": [
            _session_payload(s, windows=monitor.backend.list_windows(s.name))
            for s in sessions
        ],
        "total": len(sessions),
        "tmuxAvailable": monitor.backend.available,
    }


@router.get("/api/workers/{session_name}")
def get_worker(
    request: Request,
    session_name: str,
    lines: int = 200,
    window: Optional[int] = None,
) -> dict:
    _require_valid_session(session_name)
    if lines < 1 or lines > 1000:
        raise HTTPException(status_code=400, detail="lines must be between 1 and 1000")
    if window is not None:
        _require_valid_window(window)
    monitor = request.app.state.tmux_monitor
    session = _find_session(monitor, session_name)
    windows = monitor.backend.list_windows(session_name)
    if window is not None and all(w.index != window for w in windows):
        raise HTTPException(status_code=404, detail="worker window not found")
    capture = monitor.backend.capture(session_name, lines=lines, window=window)
    return _session_payload(session, windows=windows, capture=capture)


@router.post("/api/workers/{session_name}/actions")
def request_worker_action(
    request: Request,
    session_name: str,
    action_request: WorkerActionRequest,
) -> dict:
    _require_valid_session(session_name)
    if action_request.window is not None:
        _require_valid_window(action_request.window)
    if action_request.action not in {"close-session", "close-window"}:
        raise HTTPException(status_code=400, detail="unsupported worker action")
    if action_request.action == "close-window" and action_request.window is None:
        raise HTTPException(status_code=400, detail="window is required for close-window")

    monitor = request.app.state.tmux_monitor
    _find_session(monitor, session_name)
    if action_request.window is not None:
        windows = monitor.backend.list_windows(session_name)
        if all(w.index != action_request.window for w in windows):
            raise HTTPException(status_code=404, detail="worker window not found")

    root = Path(request.app.state.awg_reader.root)
    _require_valid_queue_target(action_request.target, root)
    queue = MessageQueue(root)
    body_lines = [
        "Dashboard requested tmux worker action.",
        f"Action: {action_request.action}",
        f"Session: {session_name}",
    ]
    if action_request.window is not None:
        body_lines.append(f"Window: {action_request.window}")
    if action_request.reason:
        body_lines.append(f"Reason: {action_request.reason}")
    body_lines.extend([
        "",
        "Do not execute blindly. Verify target liveness and scope, then perform the tmux operation only if safe.",
        "Report the result back to the dashboard/report channel.",
    ])
    message_id = queue.send(
        "dashboard",
        action_request.target,
        "instruction",
        "\n".join(body_lines),
        correlation_id=f"dashboard-worker-action-{session_name}",
        work_id=f"dashboard-worker-action-{action_request.action}",
        source_channel="dashboard:workers",
        report_target="discord:channel:1501958366841536683",
        workspace=str(root.parent),
    )
    return {"queued": True, "messageId": message_id}


async def _worker_stream(websocket: WebSocket, session_name: str, window: Optional[int] = None) -> None:
    if not _SESSION_NAME_RE.fullmatch(session_name):
        await websocket.close(code=1008)
        return
    if window is not None and (window < 0 or window > 999):
        await websocket.close(code=1008)
        return
    monitor = websocket.app.state.tmux_monitor
    target = make_target(session_name, window)
    await websocket.accept()
    try:
        queue = await monitor.subscribe(target)
    except Exception:
        await websocket.close(code=1011)
        raise
    try:
        while True:
            try:
                payload = await asyncio.wait_for(queue.get(), timeout=15.0)
                await websocket.send_json(payload)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping", "ts": time.time()})
    except WebSocketDisconnect:
        pass
    finally:
        await monitor.unsubscribe(target, queue)


@router.websocket("/ws/workers/{session_name}")
async def worker_stream(websocket: WebSocket, session_name: str) -> None:
    await _worker_stream(websocket, session_name)


@router.websocket("/ws/workers/{session_name}/windows/{window_index}")
async def worker_window_stream(websocket: WebSocket, session_name: str, window_index: str) -> None:
    if not _WINDOW_INDEX_RE.fullmatch(window_index):
        await websocket.close(code=1008)
        return
    await _worker_stream(websocket, session_name, int(window_index))
