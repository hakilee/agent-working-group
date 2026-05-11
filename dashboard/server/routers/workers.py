from typing import Optional

import asyncio
import re
import time

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["workers"])

# tmux session names we accept: the awg- prefix plus identifier chars only.
# This blocks names that would confuse tmux's flag parsing (e.g., `-X`) and
# any path/shell-meaningful characters even though we already use argv (no shell).
_SESSION_NAME_RE = re.compile(r"^awg-[A-Za-z0-9_.-]{1,64}$")


def _require_valid_session(session_name: str) -> None:
    if not _SESSION_NAME_RE.fullmatch(session_name):
        raise HTTPException(status_code=400, detail="invalid session name")


def _session_payload(session, capture: Optional[str] = None) -> dict:
    uptime = max(0, int(time.time()) - int(session.created_at)) if session.created_at else None
    payload = {
        "session": session.name,
        "createdAt": session.created_at,
        "uptimeSeconds": uptime,
        "attached": session.attached,
        "windows": session.windows,
        "status": "attached" if session.attached else "running",
    }
    if capture is not None:
        payload["recentOutput"] = capture
    return payload


@router.get("/api/workers")
def list_workers(request: Request) -> dict:
    monitor = request.app.state.tmux_monitor
    sessions = monitor.list_sessions()
    return {
        "items": [_session_payload(s) for s in sessions],
        "total": len(sessions),
        "tmuxAvailable": monitor.backend.available,
    }


@router.get("/api/workers/{session_name}")
def get_worker(request: Request, session_name: str, lines: int = 200) -> dict:
    _require_valid_session(session_name)
    monitor = request.app.state.tmux_monitor
    sessions = {s.name: s for s in monitor.list_sessions()}
    session = sessions.get(session_name)
    if session is None:
        raise HTTPException(status_code=404, detail="worker session not found")
    capture = monitor.backend.capture(session_name, lines=lines)
    monitor._last_capture[session_name] = capture  # noqa: SLF001 — prime cache for WS diffs
    return _session_payload(session, capture=capture)


@router.websocket("/ws/workers/{session_name}")
async def worker_stream(websocket: WebSocket, session_name: str) -> None:
    if not _SESSION_NAME_RE.fullmatch(session_name):
        await websocket.close(code=1008)
        return
    monitor = websocket.app.state.tmux_monitor
    await websocket.accept()
    try:
        queue = await monitor.subscribe(session_name)
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
        await monitor.unsubscribe(session_name, queue)
