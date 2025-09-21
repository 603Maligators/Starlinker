"""Scheduler scaffolding for manual triggers and health reporting."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Dict, Optional

from .config import StarlinkerConfig


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


@dataclass
class HealthStatus:
    """Tracks lightweight operational signals for the API."""

    last_poll: Optional[datetime] = None
    last_poll_reason: Optional[str] = None
    last_digests: Dict[str, datetime] = field(default_factory=dict)
    last_config: Optional[StarlinkerConfig] = None
    running: bool = False
    _lock: Lock = field(default_factory=Lock, init=False, repr=False)

    def mark_started(self) -> None:
        with self._lock:
            self.running = True

    def mark_stopped(self) -> None:
        with self._lock:
            self.running = False

    def record_poll(self, when: datetime, reason: str) -> None:
        with self._lock:
            self.last_poll = when
            self.last_poll_reason = reason

    def record_digest(self, when: datetime, digest_type: str) -> None:
        with self._lock:
            self.last_digests[digest_type] = when

    def update_config(self, config: StarlinkerConfig) -> None:
        with self._lock:
            self.last_config = config

    def snapshot(self) -> Dict[str, Optional[str]]:
        with self._lock:
            return {
                "running": self.running,
                "last_poll": _iso(self.last_poll),
                "last_poll_reason": self.last_poll_reason,
                "last_digests": {k: _iso(v) for k, v in self.last_digests.items()},
                "config": self.last_config.model_dump() if self.last_config else None,
            }


class SchedulerService:
    """Placeholder scheduler for manual trigger endpoints."""

    def __init__(self, settings_repo, health: Optional[HealthStatus] = None) -> None:
        self._settings_repo = settings_repo
        self._health = health or HealthStatus()
        self._lock = Lock()

    def start(self) -> None:
        with self._lock:
            self._health.mark_started()

    def stop(self) -> None:
        with self._lock:
            self._health.mark_stopped()

    def refresh_config(self, config: Optional[StarlinkerConfig] = None) -> StarlinkerConfig:
        cfg = config or self._settings_repo.load()
        self._health.update_config(cfg)
        return cfg

    def trigger_poll(self, reason: str = "manual") -> Dict[str, str]:
        now = datetime.now(timezone.utc)
        self._health.record_poll(now, reason)
        return {"triggered_at": _iso(now), "reason": reason}

    def trigger_digest(self, digest_type: str = "daily") -> Dict[str, str]:
        now = datetime.now(timezone.utc)
        self._health.record_digest(now, digest_type)
        return {"triggered_at": _iso(now), "type": digest_type}

    def describe(self) -> Dict[str, Optional[str]]:
        return self._health.snapshot()

    @property
    def health(self) -> HealthStatus:
        return self._health
