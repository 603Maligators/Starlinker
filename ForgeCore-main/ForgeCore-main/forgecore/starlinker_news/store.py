"""Persistence helpers for Starlinker."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

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
)


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
