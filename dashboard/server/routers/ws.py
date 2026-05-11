"""WebSocket endpoints for streaming queue and liveness state.

Both endpoints share the same envelope shape: each frame is the snapshot
returned by `AwgWatcher` for the relevant channel, plus a `ping` frame every
~15 seconds while idle so intermediaries don't close the connection.
"""

import asyncio
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect


logger = logging.getLogger(__name__)

router = APIRouter(tags=["ws"])

PING_TIMEOUT_SEC = 15.0


async def _serve(websocket: WebSocket, channel: str) -> None:
    watcher = websocket.app.state.awg_watcher
    await websocket.accept()
    try:
        queue = await watcher.subscribe(channel)
    except Exception:
        await websocket.close(code=1011)
        raise
    try:
        while True:
            try:
                payload = await asyncio.wait_for(queue.get(), timeout=PING_TIMEOUT_SEC)
                await websocket.send_json(payload)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping", "ts": time.time()})
    except WebSocketDisconnect:
        pass
    finally:
        await watcher.unsubscribe(channel, queue)


@router.websocket("/ws/queues")
async def stream_queues(websocket: WebSocket) -> None:
    await _serve(websocket, "queues")


@router.websocket("/ws/liveness")
async def stream_liveness(websocket: WebSocket) -> None:
    await _serve(websocket, "liveness")
