"""Workshop WebSocket + REST endpoints.

GET /api/workshop  → initial snapshot
WS  /ws/workshop   → live state sync (server pushes agent state changes)
"""

import asyncio
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request

from ..services.workshop_state import WorkshopState

logger = logging.getLogger(__name__)

router = APIRouter(tags=["workshop"])

PING_INTERVAL_SEC = 15.0


def _get_state(request: Request) -> WorkshopState:
    return request.app.state.workshop_state


@router.get("/api/workshop")
def get_workshop_snapshot(request: Request) -> dict:
    """Return the current workshop state for initial page load."""
    state = _get_state(request)
    return state.get_snapshot()


@router.websocket("/ws/workshop")
async def stream_workshop(websocket: WebSocket) -> None:
    """Bidirectional WebSocket for live workshop state.

    Server → Client: pushes full snapshot periodically + on change.
    Client → Server: receives agent position/state updates for persistence.
    """
    await websocket.accept()

    state: WorkshopState = websocket.app.state.workshop_state

    # Send initial snapshot
    await websocket.send_json(state.get_snapshot())

    # Subscribe to watcher broadcast channel for AWG queue changes
    watcher = websocket.app.state.awg_watcher
    try:
        queue = await watcher.subscribe("queues")
    except Exception:
        await websocket.close(code=1011)
        return

    async def _receive_loop() -> None:
        """Read client messages (agent state updates) and persist them."""
        try:
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "agentUpdate" and "role" in data:
                    agent_data = data.get("state", {})
                    state.update_agent(data["role"], agent_data)
        except WebSocketDisconnect:
            pass
        except Exception:
            logger.debug("workshop ws receive loop ended")

    async def _send_loop() -> None:
        """Push queue updates to the client so it can adjust agent behavior."""
        try:
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=PING_INTERVAL_SEC)
                    # Forward queue data so the client knows about AWG state changes
                    await websocket.send_json(payload)
                except asyncio.TimeoutError:
                    await websocket.send_json({"type": "ping", "ts": time.time()})
        except WebSocketDisconnect:
            pass
        except Exception:
            logger.debug("workshop ws send loop ended")
        finally:
            await watcher.unsubscribe("queues", queue)

    recv_task = asyncio.create_task(_receive_loop())
    send_task = asyncio.create_task(_send_loop())

    try:
        await asyncio.gather(recv_task, send_task)
    except Exception:
        pass
    finally:
        recv_task.cancel()
        send_task.cancel()
        try:
            await recv_task
        except asyncio.CancelledError:
            pass
        try:
            await send_task
        except asyncio.CancelledError:
            pass
