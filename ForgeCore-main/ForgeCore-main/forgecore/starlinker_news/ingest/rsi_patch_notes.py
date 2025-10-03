"""RSI Patch Notes ingest module."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Iterable, List

import httpx

from ..config import StarlinkerConfig
from .models import NormalizedSignal


API_URL = "https://robertsspaceindustries.com/api/patchnotes/get"


class RSIPatchNotesIngest:
    """Fetch patch note releases from RSI."""

    name = "rsi.patch_notes"

    def enabled(self, config: StarlinkerConfig) -> bool:
        return bool(config.sources.patch_notes.enabled)

    async def run(
        self,
        *,
        config: StarlinkerConfig,
        client: httpx.AsyncClient,
        triggered_at: datetime,
    ) -> Iterable[NormalizedSignal]:
        include_ptu = config.sources.patch_notes.include_ptu
        channels = ["LIVE"] + (["PTU"] if include_ptu else [])
        seen: set[str] = set()
        results: List[NormalizedSignal] = []
        for channel in channels:
            payload = await self._fetch_channel(client, channel)
            for item in payload:
                normalized = self._normalize_item(item, channel=channel, fetched_at=triggered_at)
                if normalized.url in seen:
                    continue
                seen.add(normalized.url)
                results.append(normalized)
        return results

    async def _fetch_channel(
        self, client: httpx.AsyncClient, channel: str
    ) -> List[Dict[str, object]]:
        params = {"page": 1, "channel": channel}
        response = await client.get(API_URL, params=params, headers={"Accept": "application/json"})
        response.raise_for_status()
        data = response.json()
        entries: List[Dict[str, object]] = []
        if not isinstance(data, dict):
            return entries
        container = data.get("data")
        if isinstance(container, dict):
            patchnotes = container.get("patchnotes")
        else:
            patchnotes = None
        if isinstance(patchnotes, list):
            for item in patchnotes:
                if isinstance(item, dict):
                    entries.append(item)
        return entries

    def _normalize_item(
        self, item: Dict[str, object], *, channel: str, fetched_at: datetime
    ) -> NormalizedSignal:
        title = str(item.get("title") or "Patch Notes")
        url = self._build_url(item.get("url"))
        published_at = self._parse_datetime(
            item.get("published_at")
            or item.get("time_created")
            or item.get("created_at")
        )
        excerpt = item.get("excerpt") or item.get("snippet") or item.get("brief")
        tags: List[str] = ["rsi", "patch-notes", channel.lower()]
        if item.get("channel") and str(item.get("channel")).lower() not in tags:
            tags.append(str(item["channel"]).lower())
        return NormalizedSignal(
            source=f"rsi.patch_notes.{channel.lower()}",
            title=title.strip(),
            url=url,
            published_at=published_at,
            fetched_at=fetched_at,
            raw_excerpt=str(excerpt).strip() if excerpt else None,
            tags=tags,
        )

    def _build_url(self, url_value: object) -> str:
        raw = str(url_value or "").strip()
        if raw.startswith("http://") or raw.startswith("https://"):
            return raw
        if not raw.startswith("/"):
            raw = f"/{raw}" if raw else "/"
        return f"https://robertsspaceindustries.com{raw}"

    def _parse_datetime(self, value: object) -> datetime:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        if isinstance(value, str):
            text = value.strip()
            for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S%z"):
                try:
                    dt = datetime.strptime(text.replace("Z", "+00:00"), fmt)
                except ValueError:
                    continue
                else:
                    return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc)
