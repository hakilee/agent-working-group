"""FastAPI entrypoint for the AWG dashboard.

Run in dev:
    cd dashboard/server && uvicorn main:app --reload --port 8000

The React app under dashboard/ is served from dashboard/dist/ in production.
"""

import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from services.awg_reader import AwgReader, default_root
from services.awg_watcher import AwgWatcher
from services.tmux_monitor import PollingTmuxMonitor
from routers import liveness as liveness_router
from routers import queue as queue_router
from routers import queues as queues_router
from routers import status as status_router
from routers import workers as workers_router
from routers import ws as ws_router


VERSION = "0.2.0"

SERVER_DIR = Path(__file__).resolve().parent
DASHBOARD_DIR = SERVER_DIR.parent
DIST_DIR = DASHBOARD_DIR / "dist"

DEFAULT_LOOPBACK_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "https://awg.haklee.me",
)

logger = logging.getLogger(__name__)


def _resolve_root() -> Path:
    """AwgReader root with DASHBOARD_ROOT taking precedence over AWG_ROOT."""
    raw = os.environ.get("DASHBOARD_ROOT")
    if raw:
        return Path(raw).expanduser()
    return default_root()


def _resolve_allowed_origins(host: str) -> list[str]:
    """Build the CORS allowlist. Reject wildcard when bound non-loopback."""
    raw = os.environ.get("DASHBOARD_ALLOWED_ORIGINS")
    if raw:
        origins = [item.strip() for item in raw.split(",") if item.strip()]
    else:
        origins = list(DEFAULT_LOOPBACK_ORIGINS)
    if "*" in origins and host not in ("127.0.0.1", "localhost", "::1"):
        raise RuntimeError(
            "DASHBOARD_ALLOWED_ORIGINS=* is not permitted when DASHBOARD_HOST "
            f"is non-loopback (got {host!r}). Set an explicit origin list."
        )
    return origins


@asynccontextmanager
async def lifespan(app: FastAPI):
    await app.state.tmux_monitor.start()
    await app.state.awg_watcher.start()
    try:
        yield
    finally:
        await app.state.awg_watcher.stop()
        await app.state.tmux_monitor.stop()


def create_app() -> FastAPI:
    logging.basicConfig(
        level=os.environ.get("DASHBOARD_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    app = FastAPI(title="AWG Dashboard", version=VERSION, lifespan=lifespan)

    host = os.environ.get("DASHBOARD_HOST", "127.0.0.1")
    allowed_origins = _resolve_allowed_origins(host)
    app.state.allowed_origins = allowed_origins
    app.state.started_at = time.time()
    app.state.version = VERSION
    logger.info("CORS allowed origins: %s", allowed_origins)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    reader = AwgReader(_resolve_root())
    app.state.awg_reader = reader
    app.state.tmux_monitor = PollingTmuxMonitor()
    app.state.awg_watcher = AwgWatcher(reader)

    app.include_router(status_router.router)
    app.include_router(queue_router.router)
    app.include_router(queues_router.router)
    app.include_router(workers_router.router)
    app.include_router(liveness_router.router)
    app.include_router(ws_router.router)

    @app.get("/api/health")
    def health() -> dict:
        counts = app.state.awg_reader.counts()
        return {
            "ok": True,
            "version": app.state.version,
            "uptimeSeconds": int(time.time() - app.state.started_at),
            "awgRoot": str(app.state.awg_reader.root),
            "counts": counts,
            "totalQueueItems": sum(counts.values()),
            "serverTime": time.time(),
        }

    _mount_static(app)
    return app


def _mount_static(app: FastAPI) -> None:
    """Serve the Vite build if it has been generated."""
    if not DIST_DIR.is_dir():
        return

    dist_root = DIST_DIR.resolve()

    assets_dir = DIST_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(dist_root / "index.html")

    @app.get("/{path:path}")
    def spa_fallback(path: str) -> FileResponse:
        # API/WS paths should 404 as JSON, not return the SPA shell.
        if path.startswith(("api/", "api", "ws/", "ws")):
            if path in ("api", "ws") or path.startswith(("api/", "ws/")):
                raise HTTPException(status_code=404, detail="not found")
        # Resolve candidate and confirm it lives under dist_root before serving.
        try:
            candidate = (DIST_DIR / path).resolve()
            candidate.relative_to(dist_root)
        except (ValueError, OSError):
            return FileResponse(dist_root / "index.html")
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(dist_root / "index.html")


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.environ.get("DASHBOARD_HOST", "127.0.0.1"),
        port=int(os.environ.get("DASHBOARD_PORT", "8000")),
        log_level=os.environ.get("DASHBOARD_LOG_LEVEL", "info").lower(),
        reload=False,
    )
