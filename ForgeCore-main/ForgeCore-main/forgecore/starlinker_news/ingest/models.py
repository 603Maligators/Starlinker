"""Data structures shared across ingest modules."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Sequence


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@dataclass(slots=True)
class NormalizedSignal:
    """Represents a normalized content signal ready for persistence."""

    source: str
    title: str
    url: str
    published_at: datetime
    fetched_at: datetime
    raw_excerpt: str | None = None
    summary: str | None = None
    tags: Sequence[str] = field(default_factory=tuple)
    priority: int = 0

    def __post_init__(self) -> None:
        self.published_at = _ensure_utc(self.published_at)
        self.fetched_at = _ensure_utc(self.fetched_at)
        if isinstance(self.tags, Iterable):
            self.tags = tuple(tag for tag in self.tags if tag)
        else:
            self.tags = tuple()

    def to_row(self) -> dict[str, object]:
        """Serialize the signal into a SQLite-friendly mapping."""

        tags_json = None
        if self.tags:
            tags_json = json_dumps(self.tags)
        return {
            "source": self.source,
            "title": self.title,
            "url": self.url,
            "published_at": self.published_at.isoformat(),
            "fetched_at": self.fetched_at.isoformat(),
            "raw_excerpt": self.raw_excerpt,
            "summary": self.summary,
            "tags_json": tags_json,
            "priority": self.priority,
        }


def json_dumps(value: Sequence[str]) -> str:
    import json

    return json.dumps(list(value))
