"""Coordinator for ingest modules."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Callable, Dict, Iterable, Mapping, Protocol

import httpx

from ..config import StarlinkerConfig
from ..store import StarlinkerDatabase
from .models import NormalizedSignal


class IngestModule(Protocol):
    """Contract implemented by ingest modules."""

    name: str

    def enabled(self, config: StarlinkerConfig) -> bool: ...

    async def run(
        self,
        *,
        config: StarlinkerConfig,
        client: httpx.AsyncClient,
        triggered_at: datetime,
    ) -> Iterable[NormalizedSignal]: ...


def _default_client_factory() -> httpx.AsyncClient:
    headers = {"User-Agent": "Starlinker/0.1"}
    return httpx.AsyncClient(timeout=httpx.Timeout(20.0), headers=headers)


class IngestManager:
    """Runs enabled ingest modules and stores their results."""

    def __init__(
        self,
        database: StarlinkerDatabase,
        *,
        http_client_factory: Callable[[], httpx.AsyncClient] | None = None,
    ) -> None:
        self._database = database
        self._client_factory = http_client_factory or _default_client_factory
        self._modules: Dict[str, IngestModule] = {}
        self._lock = asyncio.Lock()

    def register_module(self, module: IngestModule) -> None:
        self._modules[module.name] = module

    @property
    def modules(self) -> Mapping[str, IngestModule]:
        return dict(self._modules)

    async def run_poll(
        self,
        config: StarlinkerConfig,
        *,
        reason: str,
        triggered_at: datetime,
    ) -> Dict[str, Dict[str, int]]:
        """Execute a poll pass across all enabled modules."""

        async with self._lock:
            return await self._run_modules(config, reason=reason, triggered_at=triggered_at)

    async def _run_modules(
        self,
        config: StarlinkerConfig,
        *,
        reason: str,
        triggered_at: datetime,
    ) -> Dict[str, Dict[str, int]]:
        summary: Dict[str, Dict[str, int]] = {}
        async with self._client_factory() as client:
            for name, module in self._modules.items():
                if not module.enabled(config):
                    continue
                try:
                    signals = [
                        signal
                        for signal in await module.run(
                            config=config,
                            client=client,
                            triggered_at=triggered_at,
                        )
                    ]
                except Exception as exc:  # pragma: no cover - defensive guard
                    self._database.record_error(
                        module=name,
                        message=str(exc),
                        details={"reason": reason},
                    )
                    continue
                stored = self._database.store_signals(signals)
                summary[name] = {"fetched": len(signals), "stored": stored}
        return summary
