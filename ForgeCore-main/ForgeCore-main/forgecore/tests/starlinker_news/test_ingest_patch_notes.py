"""Tests for the RSI Patch Notes ingest module."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

import httpx

from forgecore.starlinker_news.config import StarlinkerConfig
from forgecore.starlinker_news.ingest import IngestManager, RSIPatchNotesIngest
from forgecore.starlinker_news.store import StarlinkerDatabase


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
