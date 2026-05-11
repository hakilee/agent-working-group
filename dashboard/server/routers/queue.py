from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(prefix="/api/queue", tags=["queue"])


@router.get("")
def list_queue(
    request: Request,
    state: str | None = Query(default=None, description="pending|processing|processed|dead"),
    agent: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=1000),
) -> dict:
    reader = request.app.state.awg_reader
    items = reader.list_items(state=state, agent=agent, limit=limit)
    return {
        "items": [item.to_summary() for item in items],
        "total": len(items),
    }


@router.get("/{item_id}")
def get_queue_item(request: Request, item_id: str) -> dict:
    reader = request.app.state.awg_reader
    item = reader.find(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="queue item not found")
    return item.to_detail()
