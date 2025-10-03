import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from forgecore.starlinker_news.alerts import AlertsService, DigestService, EmailPlaceholder
from forgecore.starlinker_news.config import StarlinkerConfig
from forgecore.starlinker_news.ingest.models import NormalizedSignal
from forgecore.starlinker_news.store import StarlinkerDatabase


class DummyClient:
    def __init__(self, recorder):
        self._recorder = recorder

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, json):
        self._recorder.append({"url": url, "json": json})

        class Response:
            status_code = 204

            def raise_for_status(self):
                return None

        return Response()


class DummyClientFactory:
    def __init__(self):
        self.requests: list[dict] = []

    def __call__(self):
        return DummyClient(self.requests)


@pytest.fixture()
def config() -> StarlinkerConfig:
    cfg = StarlinkerConfig()
    cfg.outputs.discord_webhook = "https://hooks.example"
    cfg.outputs.email_to = "ops@example"
    cfg.quiet_hours = ["00:00", "00:01"]
    return cfg


def _store_signal(db: StarlinkerDatabase, *, priority: int = 80) -> None:
    now = datetime.now(timezone.utc)
    signal = NormalizedSignal(
        source="rsi.patch_notes.live",
        title="LIVE Patch Released",
        url="https://example.com/patch",
        published_at=now - timedelta(minutes=5),
        fetched_at=now - timedelta(minutes=1),
        raw_excerpt="Patch notes summary",
        tags=("rsi", "live"),
        priority=priority,
    )
    db.store_signals([signal])


def test_alerts_service_respects_quiet_hours(tmp_path, config):
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    database.initialize()
    _store_signal(database)
    cfg = config
    cfg.quiet_hours = ["00:00", "23:59"]
    client_factory = DummyClientFactory()
    mailer = EmailPlaceholder()
    service = AlertsService(
        database,
        http_client_factory=client_factory,
        mailer=mailer,
    )
    triggered_at = datetime(2024, 1, 1, 12, tzinfo=timezone.utc)

    result = asyncio.run(service.run(cfg, triggered_at=triggered_at))

    assert result["suppressed"] is True
    assert database.list_alerts() == []
    assert client_factory.requests == []
    assert mailer.sent == []


def test_alerts_service_dispatches_and_dedupes(tmp_path, config):
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    database.initialize()
    _store_signal(database)
    cfg = config
    cfg.quiet_hours = ["23:00", "23:30"]
    client_factory = DummyClientFactory()
    mailer = EmailPlaceholder()
    service = AlertsService(
        database,
        http_client_factory=client_factory,
        mailer=mailer,
    )
    triggered_at = datetime(2024, 1, 1, 6, tzinfo=timezone.utc)

    first = asyncio.run(service.run(cfg, triggered_at=triggered_at))
    second = asyncio.run(
        service.run(cfg, triggered_at=triggered_at + timedelta(minutes=10))
    )

    assert first["alerts"] == 1
    assert second["alerts"] == 0
    assert len(database.list_alerts()) == 1
    assert len(client_factory.requests) == 1
    assert len(mailer.sent) == 1


def test_digest_service_generates_markdown_and_records(tmp_path, config):
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    database.initialize()
    now = datetime(2024, 1, 1, 12, tzinfo=timezone.utc)
    recent = NormalizedSignal(
        source="rsi.patch_notes.live",
        title="LIVE Patch",
        url="https://example.com/live",
        published_at=now - timedelta(hours=3),
        fetched_at=now - timedelta(hours=1),
        raw_excerpt="Important changes",
        tags=("live",),
        priority=80,
    )
    older = NormalizedSignal(
        source="rsi.patch_notes.ptu",
        title="PTU Update",
        url="https://example.com/ptu",
        published_at=now - timedelta(days=2),
        fetched_at=now - timedelta(days=2),
        raw_excerpt="PTU details",
        tags=("ptu",),
        priority=40,
    )
    database.store_signals([recent, older])

    cfg = config
    cfg.quiet_hours = ["23:00", "23:30"]
    client_factory = DummyClientFactory()
    mailer = EmailPlaceholder()
    service = DigestService(
        database,
        http_client_factory=client_factory,
        mailer=mailer,
    )

    result = asyncio.run(service.run_digest("daily", cfg, triggered_at=now))
    preview = service.preview("daily", cfg, triggered_at=now)

    assert result["sent"] is True
    assert result["signals"] == 1
    assert len(database.list_digests()) == 1
    assert "LIVE Patch" in preview["body"]
    assert "PTU" not in preview["body"]
    assert len(client_factory.requests) == 1
    assert len(mailer.sent) == 1


def test_digest_renderer_respects_timezone(tmp_path, config):
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    database.initialize()
    cfg = config
    cfg.timezone = "Pacific/Honolulu"
    now = datetime(2024, 1, 1, 6, tzinfo=timezone.utc)
    signal = NormalizedSignal(
        source="rsi.patch_notes.live",
        title="Morning Patch",
        url="https://example.com/patch",
        published_at=now - timedelta(hours=2),
        fetched_at=now - timedelta(hours=1),
        summary="Summary text",
        priority=90,
    )
    database.store_signals([signal])

    service = DigestService(database)
    body, signals = service.generate_digest_body("daily", cfg, triggered_at=now)

    assert signals[0].title == "Morning Patch"
    assert body.startswith("# Starlinker Daily Digest (2023-12-31)")
    assert "Morning Patch" in body
    # Honolulu is UTC-10, so published timestamp should show previous day
    assert "2023-12-31" in body

