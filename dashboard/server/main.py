"""FastAPI entrypoint for the AWG dashboard.

Run in dev:
    cd dashboard/server && uvicorn main:app --reload --port 8000

The React app under dashboard/ is served from dashboard/dist/ in production.
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from services.awg_reader import AwgReader, default_root
from services.tmux_monitor import PollingTmuxMonitor
from routers import queue as queue_router
from routers import status as status_router
from routers import workers as workers_router


SERVER_DIR = Path(__file__).resolve().parent
DASHBOARD_DIR = SERVER_DIR.parent
DIST_DIR = DASHBOARD_DIR / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await app.state.tmux_monitor.start()
    try:
        yield
    finally:
        await app.state.tmux_monitor.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="AWG Dashboard", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.awg_reader = AwgReader(default_root())
    app.state.tmux_monitor = PollingTmuxMonitor()

    app.include_router(status_router.router)
    app.include_router(queue_router.router)
    app.include_router(workers_router.router)

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "awgRoot": str(app.state.awg_reader.root)}

    _mount_static(app)
    return app


def _mount_static(app: FastAPI) -> None:
    """Serve the Vite build if it has been generated."""
    if not DIST_DIR.is_dir():
        return

    assets_dir = DIST_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(DIST_DIR / "index.html")

    @app.get("/{path:path}")
    def spa_fallback(path: str) -> FileResponse:
        # Let real API/WS paths 404 naturally; serve index for client routes.
        candidate = DIST_DIR / path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST_DIR / "index.html")


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.environ.get("DASHBOARD_HOST", "127.0.0.1"),
        port=int(os.environ.get("DASHBOARD_PORT", "8000")),
        reload=False,
    )
