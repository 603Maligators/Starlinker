"""Scheduler implementation for manual triggers and timed automation."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import Event, Lock, Timer
from typing import Callable, Dict, Optional

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .config import StarlinkerConfig


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _resolve_timezone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


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
    """Coordinates manual triggers with background scheduling."""

    def __init__(
        self,
        settings_repo,
        health: Optional[HealthStatus] = None,
        *,
        clock: Optional[Callable[[], datetime]] = None,
        interval_scale: float = 1.0,
    ) -> None:
        self._settings_repo = settings_repo
        self._health = health or HealthStatus()
        self._lock = Lock()
        self._stop_event = Event()
        self._timers: Dict[str, Timer] = {}
        self._next_runs: Dict[str, datetime] = {}
        self._config: Optional[StarlinkerConfig] = None
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._interval_scale = interval_scale

    def start(self) -> None:
        with self._lock:
            if self._health.running:
                return
            self._stop_event.clear()
            config = self._config or self._settings_repo.load()
            self._config = config
            self._health.mark_started()
            self._health.update_config(config)
            self._schedule_from_config_locked()

    def stop(self) -> None:
        with self._lock:
            if not self._health.running:
                return
            self._stop_event.set()
            self._cancel_timers_locked()
            self._health.mark_stopped()

    def refresh_config(self, config: Optional[StarlinkerConfig] = None) -> StarlinkerConfig:
        with self._lock:
            cfg = config or self._settings_repo.load()
            self._config = cfg
            self._health.update_config(cfg)
            if self._health.running and not self._stop_event.is_set():
                self._cancel_timers_locked()
                self._schedule_from_config_locked()
            return cfg

    def trigger_poll(self, reason: str = "manual") -> Dict[str, str]:
        now = self._clock()
        self._health.record_poll(now, reason)
        return {"triggered_at": _iso(now), "reason": reason}

    def trigger_digest(self, digest_type: str = "daily") -> Dict[str, str]:
        now = self._clock()
        self._health.record_digest(now, digest_type)
        return {"triggered_at": _iso(now), "type": digest_type}

    def describe(self) -> Dict[str, Optional[str]]:
        snapshot = self._health.snapshot()
        with self._lock:
            snapshot["next_runs"] = {k: _iso(v) for k, v in self._next_runs.items()}
        return snapshot

    @property
    def health(self) -> HealthStatus:
        return self._health

    # Internal helpers -------------------------------------------------

    def _cancel_timers_locked(self) -> None:
        for timer in self._timers.values():
            timer.cancel()
        self._timers.clear()
        self._next_runs.clear()

    def _schedule_from_config_locked(self) -> None:
        if self._stop_event.is_set():
            return
        cfg = self._config or self._settings_repo.load()
        schedule = cfg.schedule
        self._schedule_poll_locked(
            minutes=float(schedule.priority_poll_minutes),
            reason="schedule:priority",
            name="priority_poll",
        )
        self._schedule_poll_locked(
            minutes=float(schedule.standard_poll_hours) * 60.0,
            reason="schedule:standard",
            name="standard_poll",
        )
        self._schedule_daily_digest_locked(cfg)
        self._schedule_weekly_digest_locked(cfg)

    def _register_timer_locked(
        self, name: str, seconds: Optional[float], callback: Callable[[], None]
    ) -> None:
        existing = self._timers.pop(name, None)
        if existing is not None:
            existing.cancel()
        if seconds is None or seconds <= 0 or self._stop_event.is_set():
            self._next_runs.pop(name, None)
            return
        scaled = seconds * self._interval_scale
        if scaled <= 0:
            self._next_runs.pop(name, None)
            return
        run_at = self._clock() + timedelta(seconds=seconds)
        self._next_runs[name] = run_at
        timer = Timer(scaled, callback)
        timer.daemon = True
        self._timers[name] = timer
        timer.start()

    def _schedule_poll_locked(self, *, minutes: float, reason: str, name: str) -> None:
        seconds = minutes * 60.0

        def _callback() -> None:
            if self._stop_event.is_set():
                return
            self.trigger_poll(reason)
            with self._lock:
                if self._stop_event.is_set():
                    self._timers.pop(name, None)
                    self._next_runs.pop(name, None)
                    return
                self._schedule_poll_locked(minutes=minutes, reason=reason, name=name)

        self._register_timer_locked(name, seconds, _callback)

    def _schedule_daily_digest_locked(
        self, config: Optional[StarlinkerConfig] = None
    ) -> None:
        cfg = config or self._config or self._settings_repo.load()
        seconds = self._seconds_until_daily(cfg)

        def _callback() -> None:
            if self._stop_event.is_set():
                return
            self.trigger_digest("daily")
            with self._lock:
                if self._stop_event.is_set():
                    self._timers.pop("digest_daily", None)
                    self._next_runs.pop("digest_daily", None)
                    return
                self._schedule_daily_digest_locked()

        self._register_timer_locked("digest_daily", seconds, _callback)

    def _schedule_weekly_digest_locked(
        self, config: Optional[StarlinkerConfig] = None
    ) -> None:
        cfg = config or self._config or self._settings_repo.load()
        seconds = self._seconds_until_weekly(cfg)

        def _callback() -> None:
            if self._stop_event.is_set():
                return
            self.trigger_digest("weekly")
            with self._lock:
                if self._stop_event.is_set():
                    self._timers.pop("digest_weekly", None)
                    self._next_runs.pop("digest_weekly", None)
                    return
                self._schedule_weekly_digest_locked()

        self._register_timer_locked("digest_weekly", seconds, _callback)

    def _seconds_until_daily(self, config: StarlinkerConfig) -> Optional[float]:
        target = config.schedule.digest_daily.strip()
        if not target:
            return None
        try:
            hour, minute = (int(part) for part in target.split(":", 1))
        except ValueError:
            return None
        tz = _resolve_timezone(config.timezone)
        now_local = self._clock().astimezone(tz)
        candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate <= now_local:
            candidate += timedelta(days=1)
        return (candidate - now_local).total_seconds()

    def _seconds_until_weekly(self, config: StarlinkerConfig) -> Optional[float]:
        target = config.schedule.digest_weekly.strip()
        if not target:
            return None
        parts = target.split()
        if len(parts) != 2:
            return None
        day_raw, time_raw = parts
        day_key = day_raw.lower()[:3]
        weekdays = {
            "mon": 0,
            "tue": 1,
            "wed": 2,
            "thu": 3,
            "fri": 4,
            "sat": 5,
            "sun": 6,
        }
        if day_key not in weekdays:
            return None
        try:
            hour, minute = (int(part) for part in time_raw.split(":", 1))
        except ValueError:
            return None
        tz = _resolve_timezone(config.timezone)
        now_local = self._clock().astimezone(tz)
        candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        day_offset = (weekdays[day_key] - now_local.weekday()) % 7
        if day_offset == 0 and candidate <= now_local:
            day_offset = 7
        candidate += timedelta(days=day_offset)
        return (candidate - now_local).total_seconds()
