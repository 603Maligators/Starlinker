"""Scheduler implementation using APScheduler for Starlinker."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Event, Lock, Thread
from typing import Awaitable, Callable, Dict, Optional

from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED, JobEvent
from apscheduler.jobstores.base import JobLookupError
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .config import StarlinkerConfig
from .ingest.manager import IngestManager


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
        ingest_manager: Optional[IngestManager] = None,
        alerts_service=None,
        digest_service=None,
        clock: Optional[Callable[[], datetime]] = None,
        interval_scale: float = 1.0,
    ) -> None:
        self._settings_repo = settings_repo
        self._health = health or HealthStatus()
        self._ingest = ingest_manager
        self._alerts = alerts_service
        self._digest = digest_service
        self._lock = Lock()
        self._stop_event = Event()
        self._ready = Event()
        self._thread: Optional[Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._scheduler: Optional[AsyncIOScheduler] = None
        self._jobs: Dict[str, str] = {}
        self._next_runs: Dict[str, Optional[datetime]] = {}
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
            self._start_loop_locked()
            self._schedule_from_config_locked()

    def stop(self) -> None:
        thread: Optional[Thread] = None
        with self._lock:
            if not self._health.running:
                return
            self._stop_event.set()
            self._cancel_jobs_locked()
            self._health.mark_stopped()
            loop = self._loop
            if loop and loop.is_running():
                loop.call_soon_threadsafe(loop.stop)
            thread = self._thread
            self._thread = None
            self._loop = None
            self._scheduler = None
        if thread:
            thread.join(timeout=2.0)

    def refresh_config(self, config: Optional[StarlinkerConfig] = None) -> StarlinkerConfig:
        with self._lock:
            cfg = config or self._settings_repo.load()
            self._config = cfg
            self._health.update_config(cfg)
            if self._health.running and not self._stop_event.is_set():
                self._cancel_jobs_locked()
                self._schedule_from_config_locked()
            return cfg

    def trigger_poll(self, reason: str = "manual") -> Dict[str, str]:
        triggered_at = self._clock()
        self._submit_coroutine(self._run_poll(reason=reason, triggered_at=triggered_at))
        return {"triggered_at": _iso(triggered_at), "reason": reason}

    def trigger_digest(self, digest_type: str = "daily") -> Dict[str, str]:
        triggered_at = self._clock()
        self._submit_coroutine(
            self._run_digest(digest_type=digest_type, triggered_at=triggered_at)
        )
        return {"triggered_at": _iso(triggered_at), "type": digest_type}

    def describe(self) -> Dict[str, Optional[str]]:
        snapshot = self._health.snapshot()
        with self._lock:
            snapshot["next_runs"] = {
                k: _iso(v) for k, v in self._next_runs.items() if v is not None
            }
        return snapshot

    @property
    def health(self) -> HealthStatus:
        return self._health

    # Internal helpers -------------------------------------------------

    def _start_loop_locked(self) -> None:
        if self._loop and self._loop.is_running():
            return
        loop = asyncio.new_event_loop()
        self._loop = loop
        self._ready.clear()

        def _runner() -> None:
            asyncio.set_event_loop(loop)
            scheduler = AsyncIOScheduler(event_loop=loop, timezone=timezone.utc)
            scheduler.add_listener(
                self._on_job_event, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR
            )
            self._scheduler = scheduler
            scheduler.start()
            self._ready.set()
            try:
                loop.run_forever()
            finally:
                scheduler.shutdown(wait=False)
                self._ready.clear()
                loop.close()

        thread = Thread(target=_runner, name="StarlinkerScheduler", daemon=True)
        self._thread = thread
        thread.start()
        self._ready.wait()

    def _submit_coroutine(self, coro: Awaitable[None]) -> None:
        loop = self._loop
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, loop)
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running and running.is_running():
            running.create_task(coro)
        else:
            asyncio.run(coro)

    async def _run_poll(self, *, reason: str, triggered_at: datetime) -> None:
        self._health.record_poll(triggered_at, reason)
        ingest = self._ingest
        config = self._config or self._settings_repo.load()
        if ingest is not None:
            await ingest.run_poll(config, reason=reason, triggered_at=triggered_at)
        if self._alerts is not None:
            try:
                await self._alerts.run(config, triggered_at=triggered_at)
            except Exception as exc:  # pragma: no cover - defensive guard
                self._settings_repo.database.record_error(
                    module="scheduler.alerts",
                    message=str(exc),
                )

    async def _run_digest(self, *, digest_type: str, triggered_at: datetime) -> None:
        self._health.record_digest(triggered_at, digest_type)
        config = self._config or self._settings_repo.load()
        if self._digest is not None:
            try:
                await self._digest.run_digest(
                    digest_type, config, triggered_at=triggered_at
                )
            except Exception as exc:  # pragma: no cover - defensive guard
                self._settings_repo.database.record_error(
                    module="scheduler.digest",
                    message=str(exc),
                )

    def _cancel_jobs_locked(self) -> None:
        self._next_runs.clear()
        if not self._loop or not self._scheduler:
            self._jobs.clear()
            return

        done = Event()

        def _cancel() -> None:
            if self._scheduler:
                self._scheduler.remove_all_jobs()
            self._jobs.clear()
            done.set()

        if self._loop.is_running():
            self._loop.call_soon_threadsafe(_cancel)
            done.wait()
        else:
            _cancel()

    def _schedule_from_config_locked(self) -> None:
        if self._stop_event.is_set():
            return
        cfg = self._config or self._settings_repo.load()
        schedule = cfg.schedule
        self._schedule_interval_job(
            name="priority_poll",
            seconds=float(schedule.priority_poll_minutes) * 60.0,
            reason="schedule:priority",
        )
        self._schedule_interval_job(
            name="standard_poll",
            seconds=float(schedule.standard_poll_hours) * 3600.0,
            reason="schedule:standard",
        )
        self._schedule_daily_digest_locked(cfg)
        self._schedule_weekly_digest_locked(cfg)

    def _schedule_interval_job(self, *, name: str, seconds: float, reason: str) -> None:
        if seconds <= 0:
            self._remove_job_locked(name)
            return
        interval_seconds = seconds * self._interval_scale
        if interval_seconds <= 0:
            self._remove_job_locked(name)
            return
        trigger = IntervalTrigger(seconds=interval_seconds, timezone=timezone.utc)
        self._add_job(
            job_id=name,
            trigger=trigger,
            func=self._job_run_poll,
            kwargs={"reason": reason, "job_name": name},
        )

    def _schedule_daily_digest_locked(
        self, config: Optional[StarlinkerConfig] = None
    ) -> None:
        cfg = config or self._config or self._settings_repo.load()
        target = cfg.schedule.digest_daily.strip()
        if not target:
            self._remove_job_locked("digest_daily")
            return
        try:
            hour, minute = (int(part) for part in target.split(":", 1))
        except ValueError:
            self._remove_job_locked("digest_daily")
            return
        tz = _resolve_timezone(cfg.timezone)
        trigger = CronTrigger(hour=hour, minute=minute, timezone=tz)
        self._add_job(
            job_id="digest_daily",
            trigger=trigger,
            func=self._job_run_digest,
            kwargs={"digest_type": "daily", "job_name": "digest_daily"},
        )

    def _schedule_weekly_digest_locked(
        self, config: Optional[StarlinkerConfig] = None
    ) -> None:
        cfg = config or self._config or self._settings_repo.load()
        target = cfg.schedule.digest_weekly.strip()
        if not target:
            self._remove_job_locked("digest_weekly")
            return
        parts = target.split()
        if len(parts) != 2:
            self._remove_job_locked("digest_weekly")
            return
        day_raw, time_raw = parts
        weekdays = {
            "mon": "mon",
            "tue": "tue",
            "wed": "wed",
            "thu": "thu",
            "fri": "fri",
            "sat": "sat",
            "sun": "sun",
        }
        day_key = day_raw.lower()[:3]
        if day_key not in weekdays:
            self._remove_job_locked("digest_weekly")
            return
        try:
            hour, minute = (int(part) for part in time_raw.split(":", 1))
        except ValueError:
            self._remove_job_locked("digest_weekly")
            return
        tz = _resolve_timezone(cfg.timezone)
        trigger = CronTrigger(
            day_of_week=weekdays[day_key], hour=hour, minute=minute, timezone=tz
        )
        self._add_job(
            job_id="digest_weekly",
            trigger=trigger,
            func=self._job_run_digest,
            kwargs={"digest_type": "weekly", "job_name": "digest_weekly"},
        )

    def _add_job(self, *, job_id: str, trigger, func, kwargs: Dict[str, object]) -> None:
        if not self._loop or not self._scheduler:
            return
        done = Event()

        def _schedule() -> None:
            if not self._scheduler:
                done.set()
                return
            try:
                self._scheduler.remove_job(job_id)
            except JobLookupError:
                pass
            job = self._scheduler.add_job(
                func,
                trigger=trigger,
                id=job_id,
                kwargs=kwargs,
                coalesce=True,
                max_instances=1,
            )
            self._jobs[job_id] = job.id
            self._next_runs[job_id] = job.next_run_time
            done.set()

        self._loop.call_soon_threadsafe(_schedule)
        done.wait()

    def _remove_job_locked(self, name: str) -> None:
        self._next_runs.pop(name, None)
        if not self._loop or not self._scheduler:
            self._jobs.pop(name, None)
            return

        done = Event()

        def _remove() -> None:
            if self._scheduler:
                try:
                    self._scheduler.remove_job(name)
                except JobLookupError:
                    pass
            self._jobs.pop(name, None)
            done.set()

        if self._loop.is_running():
            self._loop.call_soon_threadsafe(_remove)
            done.wait()
        else:
            _remove()

    async def _job_run_poll(self, *, reason: str, job_name: str) -> None:
        if self._stop_event.is_set():
            return
        await self._run_poll(reason=reason, triggered_at=self._clock())

    async def _job_run_digest(self, *, digest_type: str, job_name: str) -> None:
        if self._stop_event.is_set():
            return
        await self._run_digest(digest_type=digest_type, triggered_at=self._clock())

    def _on_job_event(self, event: JobEvent) -> None:
        job_id = event.job_id
        if job_id is None:
            return
        with self._lock:
            if not self._scheduler:
                self._next_runs.pop(job_id, None)
                return
            job = self._scheduler.get_job(job_id)
            if job and job.next_run_time:
                self._next_runs[job_id] = job.next_run_time
            else:
                self._next_runs.pop(job_id, None)

