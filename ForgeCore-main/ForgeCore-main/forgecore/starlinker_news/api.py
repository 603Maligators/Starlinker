"""FastAPI application for the Starlinker backend skeleton."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .backend import StarlinkerBackend
from .config import THEME_SLUGS, StarlinkerConfig


class PollRequest(BaseModel):
    reason: str = Field(default="manual", description="Reason for manual poll trigger")


class DigestRequest(BaseModel):
    type: str = Field(default="daily", description="Digest cadence to trigger")


def create_app(
    *,
    backend: Optional[StarlinkerBackend] = None,
    data_dir: Optional[str | Path] = None,
) -> FastAPI:
    """Create a configured FastAPI application."""

    if backend is None:
        target = Path(data_dir) if data_dir else Path.cwd() / "starlinker_data"
        backend = StarlinkerBackend(target)

    app = FastAPI(title="Starlinker News Backend", version="0.1.0")

    @app.on_event("startup")
    async def _startup() -> None:  # pragma: no cover - FastAPI lifecycle wrapper
        backend.scheduler.start()

    @app.on_event("shutdown")
    async def _shutdown() -> None:  # pragma: no cover - FastAPI lifecycle wrapper
        backend.scheduler.stop()

    @app.get("/health")
    async def get_health() -> dict:
        config = backend.load_config()
        return {
            "status": "ok",
            "scheduler": backend.scheduler.describe(),
            "storage": backend.database.health_snapshot(),
            "missing": backend.missing_prerequisites(config),
            "config": config.model_dump(),
        }

    @app.get("/settings", response_model=StarlinkerConfig)
    async def get_settings() -> StarlinkerConfig:
        return backend.load_config()

    @app.put("/settings", response_model=StarlinkerConfig)
    async def put_settings(config: StarlinkerConfig) -> StarlinkerConfig:
        return backend.update_config(config)

    @app.post("/run/poll")
    async def run_poll(request: PollRequest) -> dict:
        return backend.scheduler.trigger_poll(request.reason)

    @app.post("/run/digest")
    async def run_digest(request: DigestRequest) -> dict:
        return backend.scheduler.trigger_digest(request.type)

    @app.get("/appearance/themes")
    async def list_themes() -> dict:
        return {"themes": list(THEME_SLUGS)}

    return app
