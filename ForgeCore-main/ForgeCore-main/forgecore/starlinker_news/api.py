"""FastAPI application for the Starlinker backend skeleton."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field, ValidationError

from .backend import StarlinkerBackend
from .config import THEME_SLUGS, StarlinkerConfig


class PollRequest(BaseModel):
    reason: str = Field(default="manual", description="Reason for manual poll trigger")


class DigestRequest(BaseModel):
    type: str = Field(default="daily", description="Digest cadence to trigger")


class SnoozeRequest(BaseModel):
    minutes: int = Field(default=60, ge=5, le=720, description="Minutes to snooze alerts")


def create_app(
    *,
    backend: Optional[StarlinkerBackend] = None,
    data_dir: Optional[str | Path] = None,
) -> FastAPI:
    """Create a configured FastAPI application."""

    if backend is None:
        target = Path(data_dir) if data_dir else Path.cwd() / "starlinker_data"
        backend = StarlinkerBackend(target)

    @asynccontextmanager
    async def lifespan(_: FastAPI):  # pragma: no cover - FastAPI lifecycle wrapper
        backend.scheduler.start()
        try:
            yield
        finally:
            backend.scheduler.stop()

    app = FastAPI(title="Starlinker News Backend", version="0.1.0", lifespan=lifespan)

    @app.get("/health")
    async def get_health() -> dict:
        config = backend.load_config()
        return {
            "status": "ok",
            "scheduler": backend.scheduler.describe(),
            "storage": backend.database.health_snapshot(),
            "missing": backend.missing_prerequisites(config),
            "config": config.model_dump(),
            "alerts": backend.alert_status(),
        }

    @app.get("/settings", response_model=StarlinkerConfig)
    async def get_settings() -> StarlinkerConfig:
        return backend.load_config()

    @app.put("/settings", response_model=StarlinkerConfig)
    async def put_settings(config: StarlinkerConfig) -> StarlinkerConfig:
        return backend.update_config(config)

    @app.patch("/settings", response_model=StarlinkerConfig)
    async def patch_settings(payload: dict[str, Any] = Body(...)) -> StarlinkerConfig:
        try:
            return backend.patch_config(payload)
        except ValidationError as exc:
            raise HTTPException(
                status_code=422, detail=jsonable_encoder(exc.errors())
            ) from exc

    @app.get("/settings/defaults", response_model=StarlinkerConfig)
    async def get_default_settings() -> StarlinkerConfig:
        return backend.default_config()

    @app.get("/settings/schema")
    async def get_settings_schema() -> dict[str, Any]:
        return backend.config_schema()

    @app.post("/run/poll")
    async def run_poll(request: PollRequest) -> dict:
        return backend.scheduler.trigger_poll(request.reason)

    @app.post("/run/digest")
    async def run_digest(request: DigestRequest) -> dict:
        return backend.scheduler.trigger_digest(request.type)

    @app.post("/alerts/snooze")
    async def snooze_alerts(request: SnoozeRequest) -> dict[str, object]:
        return await backend.snooze_alerts(request.minutes)

    @app.get("/digest/preview")
    async def preview_digest(digest_type: str = Query("daily")) -> dict[str, object]:
        return backend.preview_digest(digest_type)

    @app.get("/appearance/themes")
    async def list_themes() -> dict:
        return {"themes": list(THEME_SLUGS)}

    return app
