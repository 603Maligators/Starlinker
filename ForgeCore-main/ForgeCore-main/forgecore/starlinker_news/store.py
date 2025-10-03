"""Persistence helpers for Starlinker."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, Iterable, List, Optional, Sequence

from .config import StarlinkerConfig


CREATE_STATEMENTS: Iterable[str] = (
    """
    CREATE TABLE IF NOT EXISTS signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        published_at TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        raw_excerpt TEXT,
        summary TEXT,
        tags_json TEXT,
        priority INTEGER
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS digests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sent_at TEXT NOT NULL,
        type TEXT NOT NULL,
        body_markdown TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT,
        delivered_channels_json TEXT,
        dedup_key TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        module TEXT NOT NULL,
        message TEXT NOT NULL,
        details_json TEXT
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_url
    ON signals(url)
    """,
)

if TYPE_CHECKING:  # pragma: no cover - import cycle guard
    from .ingest.models import NormalizedSignal


@dataclass
class StarlinkerDatabase:
    """Lightweight SQLite wrapper used by the backend."""

    path: Path

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def initialize(self) -> "StarlinkerDatabase":
        with self.connect() as conn:
            for statement in CREATE_STATEMENTS:
                conn.execute(statement)
            conn.commit()
        return self

    def get_setting(self, key: str, default: Optional[Any] = None) -> Any:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT value_json FROM settings WHERE key = ?", (key,)
            ).fetchone()
            if not row:
                return default
            return json.loads(row["value_json"])

    def put_setting(self, key: str, value: Any) -> None:
        payload = json.dumps(value)
        now = datetime.now(timezone.utc).isoformat()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO settings(key, value_json, updated_at)
                VALUES(?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value_json=excluded.value_json,
                    updated_at=excluded.updated_at
                """,
                (key, payload, now),
            )
            conn.commit()

    def list_settings(self) -> Dict[str, Any]:
        with self.connect() as conn:
            cursor = conn.execute("SELECT key, value_json FROM settings")
            return {row["key"]: json.loads(row["value_json"]) for row in cursor.fetchall()}

    def health_snapshot(self) -> Dict[str, Any]:
        with self.connect() as conn:
            counts = {}
            for table in ("signals", "digests", "alerts"):
                counts[table] = conn.execute(
                    f"SELECT COUNT(*) FROM {table}"
                ).fetchone()[0]
            error_row = conn.execute(
                "SELECT module, message, ts FROM errors ORDER BY ts DESC LIMIT 1"
            ).fetchone()
        return {
            "counts": counts,
            "last_error": dict(error_row) if error_row else None,
        }

    # Signal queries ---------------------------------------------------

    def fetch_signals(
        self,
        *,
        since: Optional[datetime] = None,
        min_priority: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> List["StoredSignal"]:
        query = [
            "SELECT id, source, title, url, published_at, fetched_at,",
            "raw_excerpt, summary, tags_json, priority",
            "FROM signals",
        ]
        conditions: List[str] = []
        params: List[Any] = []
        if since is not None:
            conditions.append("fetched_at >= ?")
            params.append(_ensure_iso(since))
        if min_priority is not None:
            conditions.append("priority >= ?")
            params.append(int(min_priority))
        if conditions:
            query.append("WHERE " + " AND ".join(conditions))
        query.append("ORDER BY published_at DESC")
        if limit is not None:
            query.append("LIMIT ?")
            params.append(int(limit))
        sql = "\n".join(query)
        results: List[StoredSignal] = []
        with self.connect() as conn:
            cursor = conn.execute(sql, params)
            for row in cursor.fetchall():
                results.append(_row_to_signal(row))
        return results

    # Alert helpers ----------------------------------------------------

    def record_alert(
        self,
        *,
        alert_type: str,
        title: str,
        url: Optional[str],
        delivered_channels: Sequence[str],
        dedup_key: str,
        created_at: Optional[datetime] = None,
    ) -> None:
        created = _ensure_iso(created_at or datetime.now(timezone.utc))
        channels_json = json.dumps(list(delivered_channels))
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO alerts(created_at, type, title, url, delivered_channels_json, dedup_key)
                VALUES(?, ?, ?, ?, ?, ?)
                """,
                (created, alert_type, title, url, channels_json, dedup_key),
            )
            conn.commit()

    def alert_exists(self, dedup_key: str) -> bool:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT id FROM alerts WHERE dedup_key = ? LIMIT 1",
                (dedup_key,),
            ).fetchone()
            return bool(row)

    def list_alerts(self, *, limit: Optional[int] = None) -> List["AlertRecord"]:
        sql = "SELECT id, created_at, type, title, url, delivered_channels_json, dedup_key FROM alerts ORDER BY created_at DESC"
        params: List[Any] = []
        if limit is not None:
            sql += " LIMIT ?"
            params.append(int(limit))
        alerts: List[AlertRecord] = []
        with self.connect() as conn:
            cursor = conn.execute(sql, params)
            for row in cursor.fetchall():
                alerts.append(_row_to_alert(row))
        return alerts

    # Digest helpers ---------------------------------------------------

    def record_digest(
        self,
        *,
        digest_type: str,
        body_markdown: str,
        sent_at: Optional[datetime] = None,
    ) -> None:
        ts = _ensure_iso(sent_at or datetime.now(timezone.utc))
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO digests(sent_at, type, body_markdown)
                VALUES(?, ?, ?)
                """,
                (ts, digest_type, body_markdown),
            )
            conn.commit()

    def list_digests(self, *, limit: Optional[int] = None) -> List["DigestRecord"]:
        sql = "SELECT id, sent_at, type, body_markdown FROM digests ORDER BY sent_at DESC"
        params: List[Any] = []
        if limit is not None:
            sql += " LIMIT ?"
            params.append(int(limit))
        digests: List[DigestRecord] = []
        with self.connect() as conn:
            cursor = conn.execute(sql, params)
            for row in cursor.fetchall():
                digests.append(_row_to_digest(row))
        return digests

    def store_signals(self, signals: Iterable["NormalizedSignal"]) -> int:
        from .ingest.models import NormalizedSignal  # local import to avoid cycle

        rows = [signal.to_row() for signal in signals if isinstance(signal, NormalizedSignal)]
        if not rows:
            return 0
        inserted = 0
        with self.connect() as conn:
            for row in rows:
                try:
                    conn.execute(
                        """
                        INSERT INTO signals(
                            source, title, url, published_at, fetched_at,
                            raw_excerpt, summary, tags_json, priority
                        )
                        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            row["source"],
                            row["title"],
                            row["url"],
                            row["published_at"],
                            row["fetched_at"],
                            row.get("raw_excerpt"),
                            row.get("summary"),
                            row.get("tags_json"),
                            row.get("priority", 0),
                        ),
                    )
                except sqlite3.IntegrityError:
                    continue
                else:
                    inserted += 1
            conn.commit()
        return inserted

    def record_error(
        self,
        module: str,
        message: str,
        *,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        payload = json.dumps(details) if details is not None else None
        now = datetime.now(timezone.utc).isoformat()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO errors(ts, module, message, details_json)
                VALUES(?, ?, ?, ?)
                """,
                (now, module, message, payload),
            )
            conn.commit()


class SettingsRepository:
    """Adapter to map settings records onto pydantic config models."""

    SETTINGS_KEY = "starlinker.config"

    def __init__(self, database: StarlinkerDatabase) -> None:
        self.database = database
        self.database.initialize()

    def load(self) -> StarlinkerConfig:
        raw = self.database.get_setting(self.SETTINGS_KEY)
        if raw is None:
            config = StarlinkerConfig()
            self.save(config)
            return config
        return StarlinkerConfig.model_validate(raw)

    def save(self, config: StarlinkerConfig) -> StarlinkerConfig:
        payload = config.model_dump()
        self.database.put_setting(self.SETTINGS_KEY, payload)
        return config

    def default_config(self) -> StarlinkerConfig:
        return StarlinkerConfig()

    def config_schema(self) -> Dict[str, Any]:
        return StarlinkerConfig.model_json_schema()

    def apply_patch(self, patch: Mapping[str, Any]) -> StarlinkerConfig:
        current = self.load().model_dump()
        merged = self._merge_dict(current, patch)
        config = StarlinkerConfig.model_validate(merged)
        self.save(config)
        return config

    def missing_prerequisites(self, config: Optional[StarlinkerConfig] = None) -> list[str]:
        cfg = config or self.load()
        missing: list[str] = []
        if not cfg.outputs.discord_webhook and not cfg.outputs.email_to:
            missing.append("digest_output")
        if not cfg.timezone:
            missing.append("timezone")
        return missing

    def export_raw(self) -> Dict[str, Any]:
        return self.database.list_settings()

    def _merge_dict(self, base: Dict[str, Any], patch: Mapping[str, Any]) -> Dict[str, Any]:
        result: Dict[str, Any] = dict(base)
        for key, value in patch.items():
            if (
                isinstance(value, Mapping)
                and key in result
                and isinstance(result[key], dict)
            ):
                result[key] = self._merge_dict(result[key], value)
            else:
                result[key] = value
        return result


@dataclass
class StoredSignal:
    id: int
    source: str
    title: str
    url: str
    published_at: datetime
    fetched_at: datetime
    raw_excerpt: Optional[str]
    summary: Optional[str]
    tags: Sequence[str]
    priority: int


@dataclass
class AlertRecord:
    id: int
    created_at: datetime
    type: str
    title: str
    url: Optional[str]
    delivered_channels: Sequence[str]
    dedup_key: str


@dataclass
class DigestRecord:
    id: int
    sent_at: datetime
    type: str
    body_markdown: str


def _ensure_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _row_to_signal(row: sqlite3.Row) -> StoredSignal:
    tags_raw = row["tags_json"]
    tags: Sequence[str]
    if tags_raw:
        try:
            payload = json.loads(tags_raw)
            if isinstance(payload, list):
                tags = tuple(str(item) for item in payload if item)
            else:
                tags = tuple()
        except json.JSONDecodeError:
            tags = tuple()
    else:
        tags = tuple()
    return StoredSignal(
        id=row["id"],
        source=row["source"],
        title=row["title"],
        url=row["url"],
        published_at=_parse_iso(row["published_at"]),
        fetched_at=_parse_iso(row["fetched_at"]),
        raw_excerpt=row["raw_excerpt"],
        summary=row["summary"],
        tags=tags,
        priority=int(row["priority"] or 0),
    )


def _row_to_alert(row: sqlite3.Row) -> AlertRecord:
    delivered_raw = row["delivered_channels_json"]
    delivered: Sequence[str]
    if delivered_raw:
        try:
            payload = json.loads(delivered_raw)
            if isinstance(payload, list):
                delivered = tuple(str(item) for item in payload if item)
            else:
                delivered = tuple()
        except json.JSONDecodeError:
            delivered = tuple()
    else:
        delivered = tuple()
    return AlertRecord(
        id=row["id"],
        created_at=_parse_iso(row["created_at"]),
        type=row["type"],
        title=row["title"],
        url=row["url"],
        delivered_channels=delivered,
        dedup_key=row["dedup_key"],
    )


def _row_to_digest(row: sqlite3.Row) -> DigestRecord:
    return DigestRecord(
        id=row["id"],
        sent_at=_parse_iso(row["sent_at"]),
        type=row["type"],
        body_markdown=row["body_markdown"],
    )
