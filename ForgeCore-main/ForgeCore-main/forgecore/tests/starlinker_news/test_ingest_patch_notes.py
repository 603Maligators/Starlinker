"""Tests for the RSI Patch Notes ingest module."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

import httpx

from forgecore.starlinker_news.config import StarlinkerConfig
from forgecore.starlinker_news.ingest import (
    IngestManager,
    NormalizedSignal,
    RSIPatchNotesIngest,
)
from forgecore.starlinker_news.store import StarlinkerDatabase


def test_normalized_signal_serialization_cleans_tags_and_timezone() -> None:
    published = datetime(2024, 1, 1, 12, 0)  # naive
    fetched = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)
    signal = NormalizedSignal(
        source="test",
        title="Example",
        url="https://example.com",
        published_at=published,
        fetched_at=fetched,
        tags=["alpha", "", None, "beta"],
        priority=10,
    )

    assert signal.published_at.tzinfo == timezone.utc
    assert signal.fetched_at.tzinfo == timezone.utc
    assert signal.tags == ("alpha", "beta")

    row = signal.to_row()
    assert row["published_at"].endswith("+00:00")
    assert row["tags_json"] == "[\"alpha\", \"beta\"]"


def test_patch_notes_build_url_handles_relative_paths() -> None:
    ingest = RSIPatchNotesIngest()

    absolute = ingest._build_url("https://example.com/post")
    relative = ingest._build_url("comm-link/post")
    empty = ingest._build_url("")

    assert absolute == "https://example.com/post"
    assert relative == "https://robertsspaceindustries.com/comm-link/post"
    assert empty == "https://robertsspaceindustries.com/"


def test_patch_notes_parse_datetime_supports_multiple_formats() -> None:
    ingest = RSIPatchNotesIngest()

    from_timestamp = ingest._parse_datetime(1700000000)
    from_iso = ingest._parse_datetime("2024-01-01T09:15:00Z")
    fallback = ingest._parse_datetime("not-a-date")

    assert from_timestamp.tzinfo == timezone.utc
    assert from_iso.tzinfo == timezone.utc
    assert abs((fallback - datetime.now(timezone.utc)).total_seconds()) < 5


def test_patch_notes_normalize_item_scores_priority() -> None:
    ingest = RSIPatchNotesIngest()
    now = datetime(2024, 1, 1, 15, tzinfo=timezone.utc)
    payload = {
        "title": "LIVE Hotfix",
        "url": "/comm-link/post",
        "published_at": "2024-01-01T10:00:00Z",
        "excerpt": "Notes",
        "channel": "LIVE",
    }

    live = ingest._normalize_item(payload, channel="LIVE", fetched_at=now)
    ptu = ingest._normalize_item(payload | {"channel": "PTU"}, channel="PTU", fetched_at=now)

    assert live.priority >= 85  # hotfix keywords boost priority
    assert ptu.source == "rsi.patch_notes.ptu"
    assert "live" in live.tags and "ptu" in ptu.tags


def test_patch_notes_ingest_persists_signals(tmp_path) -> None:
    database = StarlinkerDatabase(tmp_path / "starlinker.db")
    database.initialize()
    config = StarlinkerConfig()
    config.sources.patch_notes.include_ptu = True
    triggered_at = datetime(2024, 10, 1, 12, 0, tzinfo=timezone.utc)

    live_payload = [
        {
            "title": "Star Citizen 3.21.0",
            "url": "/comm-link//patch-notes/star-citizen-3-21-0",
            "published_at": "2024-09-30T18:00:00Z",
            "excerpt": "LIVE patch release",
            "channel": "LIVE",
        }
    ]
    ptu_payload = [
        {
            "title": "Star Citizen 3.21.1 PTU",
            "url": "https://robertsspaceindustries.com/patch-notes/star-citizen-3-21-1-ptu",
            "time_created": 1720000000,
            "snippet": "PTU build",
            "channel": "PTU",
        }
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        channel = request.url.params.get("channel", "LIVE")
        payload = live_payload if channel == "LIVE" else ptu_payload
        return httpx.Response(200, json={"data": {"patchnotes": payload}})

    transport = httpx.MockTransport(handler)

    def client_factory() -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=transport)

    manager = IngestManager(database, http_client_factory=client_factory)
    manager.register_module(RSIPatchNotesIngest())

    summary = asyncio.run(
        manager.run_poll(
            config,
            reason="test",
            triggered_at=triggered_at,
        )
    )

    assert summary["rsi.patch_notes"]["stored"] == 2

    with database.connect() as conn:
        rows = conn.execute(
            "SELECT source, title, url, tags_json FROM signals ORDER BY id"
        ).fetchall()

    assert {row["source"] for row in rows} == {
        "rsi.patch_notes.live",
        "rsi.patch_notes.ptu",
    }
    tags_sets = [set(json.loads(row["tags_json"])) for row in rows]
    for tags in tags_sets:
        assert "rsi" in tags and "patch-notes" in tags

    repeat = asyncio.run(
        manager.run_poll(
            config,
            reason="repeat",
            triggered_at=triggered_at,
        )
    )
    assert repeat["rsi.patch_notes"]["stored"] == 0
