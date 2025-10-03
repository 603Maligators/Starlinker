"""Core backend wiring for the Starlinker News module."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from collections.abc import Mapping
from typing import Any

from .config import StarlinkerConfig
from .ingest import IngestManager, RSIPatchNotesIngest
from .scheduler import HealthStatus, SchedulerService
from .store import SettingsRepository, StarlinkerDatabase


class StarlinkerBackend:
    """Coordinates database, configuration and scheduler state."""

    def __init__(
        self,
        data_dir: os.PathLike[str] | str,
        *,
        database_filename: str = "starlinker.db",
    ) -> None:
        base = Path(data_dir)
        base.mkdir(parents=True, exist_ok=True)
        self._db_path = base / database_filename
        self.database = StarlinkerDatabase(self._db_path)
        self.database.initialize()
        self.settings = SettingsRepository(self.database)
        self.ingest = IngestManager(self.database)
        self.ingest.register_module(RSIPatchNotesIngest())
        self.health = HealthStatus()
        config = self.settings.load()
        self.scheduler = SchedulerService(
            self.settings, self.health, ingest_manager=self.ingest
        )
        self.scheduler.refresh_config(config)

    @property
    def data_dir(self) -> Path:
        return self._db_path.parent

    def load_config(self) -> StarlinkerConfig:
        return self.settings.load()

    def update_config(self, config: StarlinkerConfig) -> StarlinkerConfig:
        stored = self.settings.save(config)
        self.scheduler.refresh_config(stored)
        return stored

    def patch_config(self, patch: Mapping[str, Any]) -> StarlinkerConfig:
        stored = self.settings.apply_patch(patch)
        self.scheduler.refresh_config(stored)
        return stored

    def default_config(self) -> StarlinkerConfig:
        return self.settings.default_config()

    def config_schema(self) -> dict[str, object]:
        return self.settings.config_schema()

    def missing_prerequisites(self, config: Optional[StarlinkerConfig] = None) -> list[str]:
        cfg = config or self.settings.load()
        return self.settings.missing_prerequisites(cfg)

    def create_app(self):  # pragma: no cover - thin wrapper
        from .api import create_app

        return create_app(backend=self)
