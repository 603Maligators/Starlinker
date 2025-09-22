"""Tests for the Starlinker scheduler service."""

from __future__ import annotations

import time

from forgecore.starlinker_news.scheduler import HealthStatus, SchedulerService
from forgecore.starlinker_news.store import SettingsRepository, StarlinkerDatabase


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

    scheduler = SchedulerService(
        settings, HealthStatus(), interval_scale=0.01
    )  # scale 1 minute -> ~0.6s for tests
    try:
        scheduler.start()
        snapshot = scheduler.describe()
        assert snapshot["running"] is True
        assert "priority_poll" in snapshot["next_runs"]

        triggered = _wait_for(
            lambda: scheduler.describe()["last_poll_reason"] == "schedule:priority"
        )
        assert triggered, "priority poll was not triggered automatically"
    finally:
        scheduler.stop()


def test_refresh_config_reschedules_priority_poll(tmp_path) -> None:
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    settings = SettingsRepository(database)
    baseline = settings.load()
    baseline.schedule.priority_poll_minutes = 1
    baseline.schedule.standard_poll_hours = 0
    settings.save(baseline)

    scheduler = SchedulerService(settings, HealthStatus(), interval_scale=0.01)
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

    scheduler = SchedulerService(settings, HealthStatus(), interval_scale=0.01)
    scheduler.start()
    scheduler.stop()

    snapshot = scheduler.describe()
    assert snapshot["running"] is False
    assert snapshot["next_runs"] == {}
