"""Liveness endpoints: heartbeats, processing timeouts, response-contract breaches.

Uses `TimeoutChecker` from `agent_working_group.timeout` directly so the
dashboard never re-implements the timeout semantics — it's the same source
of truth the awg-*-monitor.sh CLI scripts consult.
"""

from typing import Optional

from fastapi import APIRouter, Query, Request

from agent_working_group.timeout import (
    DEFAULT_PROCESSING_TIMEOUT_SEC,
    TimeoutChecker,
)

from services.heartbeat_reader import HeartbeatReader

router = APIRouter(prefix="/api/liveness", tags=["liveness"])


def _checker(request: Request) -> TimeoutChecker:
    reader = request.app.state.awg_reader
    return TimeoutChecker(reader.root)


def _heartbeats(request: Request) -> HeartbeatReader:
    reader = request.app.state.awg_reader
    return HeartbeatReader(reader.root)


@router.get("/heartbeats")
def list_heartbeats(
    request: Request,
    timeout_seconds: Optional[int] = Query(
        default=None, ge=1, alias="timeoutSeconds"
    ),
) -> dict:
    entries = _heartbeats(request).list_heartbeats(timeout_seconds=timeout_seconds)
    counts = {"fresh": 0, "stale": 0, "missing": 0}
    for entry in entries:
        counts[entry.status] = counts.get(entry.status, 0) + 1
    return {
        "items": [entry.to_dict() for entry in entries],
        "counts": counts,
        "total": len(entries),
    }


@router.get("/timeouts")
def list_timeouts(
    request: Request,
    timeout_seconds: int = Query(
        default=DEFAULT_PROCESSING_TIMEOUT_SEC, ge=1, alias="timeoutSeconds"
    ),
) -> dict:
    stale = _checker(request).stale_processing(timeout_seconds=timeout_seconds)
    return {
        "items": [item.to_dict() for item in stale],
        "total": len(stale),
        "timeoutSeconds": timeout_seconds,
    }


@router.get("/contracts")
def list_contract_breaches(request: Request) -> dict:
    breaches = _checker(request).response_contract_breaches()
    return {
        "items": [breach.to_dict() for breach in breaches],
        "total": len(breaches),
    }
