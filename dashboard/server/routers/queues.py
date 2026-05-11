"""Multi-agent queue endpoints.

`/api/queue` (singular) preserves the original flat list. `/api/queues` (plural)
exposes the queue tree as a hierarchy: agents → messages → message detail.
"""

import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(prefix="/api/queues", tags=["queues"])

# Agent and message ids land in URL paths and are used to build filesystem
# paths inside AwgReader. Restrict to safe identifier characters so a crafted
# path segment can't escape the queue root via "..".
_AGENT_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
_MESSAGE_ID_RE = re.compile(r"^[A-Za-z0-9_.\-:]{1,128}$")


def _require_agent(agent: str) -> None:
    if not _AGENT_RE.fullmatch(agent):
        raise HTTPException(status_code=400, detail="invalid agent name")


def _require_message_id(message_id: str) -> None:
    if not _MESSAGE_ID_RE.fullmatch(message_id):
        raise HTTPException(status_code=400, detail="invalid message id")


@router.get("")
def list_agents(request: Request) -> dict:
    reader = request.app.state.awg_reader
    return {
        "root": str(reader.root),
        "agents": reader.agents_summary(),
    }


@router.get("/{agent}")
def list_agent_messages(
    request: Request,
    agent: str,
    status: Optional[str] = Query(
        default=None,
        description="inbox|processing|processed|dead (or public alias pending)",
    ),
    limit: Optional[int] = Query(default=None, ge=1, le=1000),
) -> dict:
    _require_agent(agent)
    reader = request.app.state.awg_reader
    if agent not in reader.agents():
        raise HTTPException(status_code=404, detail="agent not found")
    items = reader.list_items(state=status, agent=agent, limit=limit)
    return {
        "agent": agent,
        "counts": reader.agent_counts(agent),
        "items": [item.to_summary() for item in items],
        "total": len(items),
    }


@router.get("/{agent}/{message_id}")
def get_agent_message(request: Request, agent: str, message_id: str) -> dict:
    _require_agent(agent)
    _require_message_id(message_id)
    reader = request.app.state.awg_reader
    item = reader.find_in_agent(agent, message_id)
    if item is None:
        raise HTTPException(status_code=404, detail="message not found")
    return item.to_detail()
