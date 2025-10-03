"""Tests for the Starlinker scheduler service."""

from __future__ import annotations

import time

from threading import Lock

from forgecore.starlinker_news.scheduler import HealthStatus, SchedulerService
from forgecore.starlinker_news.store import SettingsRepository, StarlinkerDatabase

class StubIngestManager:
    def __init__(self) -> None:
        self._lock = Lock()
        self._calls: list[dict] = []

    async def run_poll(self, config, *, reason: str, triggered_at):
        with self._lock:
            self._calls.append({
                "config": config,
                "reason": reason,
                "triggered_at": triggered_at,
            })

    def poll_count(self) -> int:
        with self._lock:
            return len(self._calls)

    def last_reason(self) -> str | None:
        with self._lock:
            if not self._calls:
                return None
            return self._calls[-1]["reason"]


def _wait_for(predicate, *, timeout: float = 3.0, interval: float = 0.05) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def test_scheduler_triggers_priority_poll_periodically(tmp_path) -> None:
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    settings = SettingsRepository(database)
    config = settings.load()
    config.schedule.priority_poll_minutes = 1
    config.schedule.standard_poll_hours = 0
    config.schedule.digest_daily = ""
    config.schedule.digest_weekly = ""
    settings.save(config)

    ingest = StubIngestManager()
    scheduler = SchedulerService(
        settings, HealthStatus(), ingest_manager=ingest, interval_scale=0.01
    )  # scale 1 minute -> ~0.6s for tests
    try:
        scheduler.start()
        snapshot = scheduler.describe()
        assert snapshot["running"] is True
        assert "priority_poll" in snapshot["next_runs"]

        triggered = _wait_for(lambda: ingest.poll_count() > 0)
        assert triggered, "priority poll was not triggered automatically"
        assert ingest.last_reason() == "schedule:priority"
    finally:
        scheduler.stop()


def test_scheduler_schedules_digest_jobs_from_config(tmp_path) -> None:
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    settings = SettingsRepository(database)
    config = settings.load()
    config.schedule.priority_poll_minutes = 0
    config.schedule.standard_poll_hours = 0
    config.schedule.digest_daily = "06:30"
    config.schedule.digest_weekly = "wed 07:45"
    settings.save(config)

    scheduler = SchedulerService(settings, HealthStatus(), interval_scale=0.01)
    try:
        scheduler.start()
        snapshot = scheduler.describe()
        assert "digest_daily" in snapshot["next_runs"]
        assert "digest_weekly" in snapshot["next_runs"]
        daily = snapshot["next_runs"]["digest_daily"]
        weekly = snapshot["next_runs"]["digest_weekly"]
        assert daily is not None and daily.endswith("+00:00")
        assert weekly is not None and weekly.endswith("+00:00")
    finally:
        scheduler.stop()


def test_refresh_config_reschedules_priority_poll(tmp_path) -> None:
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    settings = SettingsRepository(database)
    baseline = settings.load()
    baseline.schedule.priority_poll_minutes = 1
    baseline.schedule.standard_poll_hours = 0
    settings.save(baseline)

    ingest = StubIngestManager()
    scheduler = SchedulerService(
        settings, HealthStatus(), ingest_manager=ingest, interval_scale=0.01
    )
    try:
        scheduler.start()
        assert "priority_poll" in scheduler.describe()["next_runs"]

        updated = baseline.model_copy()
        updated.schedule.priority_poll_minutes = 0
        settings.save(updated)
        scheduler.refresh_config(updated)

        assert "priority_poll" not in scheduler.describe()["next_runs"]
    finally:
        scheduler.stop()


def test_scheduler_stop_clears_state(tmp_path) -> None:
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    settings = SettingsRepository(database)
    config = settings.load()
    config.schedule.priority_poll_minutes = 1
    config.schedule.standard_poll_hours = 0
    settings.save(config)

    ingest = StubIngestManager()
    scheduler = SchedulerService(
        settings, HealthStatus(), ingest_manager=ingest, interval_scale=0.01
    )
    scheduler.start()
    scheduler.stop()

    snapshot = scheduler.describe()
    assert snapshot["running"] is False
    assert snapshot["next_runs"] == {}


def test_scheduler_invalid_digest_configuration_removes_jobs(tmp_path) -> None:
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    settings = SettingsRepository(database)
    config = settings.load()
    config.schedule.digest_daily = "invalid"
    config.schedule.digest_weekly = "wed"
    settings.save(config)

    scheduler = SchedulerService(settings, HealthStatus(), interval_scale=0.01)
    try:
        scheduler.start()
        assert "digest_daily" not in scheduler.describe()["next_runs"]
        assert "digest_weekly" not in scheduler.describe()["next_runs"]

        config.schedule.digest_daily = "07:15"
        config.schedule.digest_weekly = "fri 08:30"
        settings.save(config)
        scheduler.refresh_config(config)

        snapshot = scheduler.describe()
        assert "digest_daily" in snapshot["next_runs"]
        assert "digest_weekly" in snapshot["next_runs"]
    finally:
        scheduler.stop()


def test_manual_trigger_uses_ingest(tmp_path) -> None:
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    settings = SettingsRepository(database)
    ingest = StubIngestManager()
    scheduler = SchedulerService(
        settings, HealthStatus(), ingest_manager=ingest, interval_scale=0.01
    )
    try:
        scheduler.start()
        scheduler.trigger_poll("manual-test")
        triggered = _wait_for(lambda: ingest.poll_count() > 0)
        assert triggered
        assert ingest.last_reason() == "manual-test"
    finally:
        scheduler.stop()
