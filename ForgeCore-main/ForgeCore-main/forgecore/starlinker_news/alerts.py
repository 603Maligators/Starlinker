"""Alert and digest services for Starlinker."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, time, timezone
from typing import Callable, List, Optional

import httpx
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .config import StarlinkerConfig
from .store import StarlinkerDatabase, StoredSignal


@dataclass
class AlertCandidate:
    signal: StoredSignal
    priority: int
    dedup_key: str


class EmailSenderProtocol:
    """Protocol-like shim for sending email placeholders."""

    def send(self, to: str, subject: str, body: str) -> None:  # pragma: no cover - protocol helper
        raise NotImplementedError


class EmailPlaceholder(EmailSenderProtocol):
    """Simple in-memory placeholder for email delivery."""

    def __init__(self) -> None:
        self.sent: List[dict[str, str]] = []

    def send(self, to: str, subject: str, body: str) -> None:
        self.sent.append({"to": to, "subject": subject, "body": body})


class AlertsService:
    """Evaluate stored signals, dedupe and dispatch alerts."""

    def __init__(
        self,
        database: StarlinkerDatabase,
        *,
        http_client_factory: Callable[[], httpx.AsyncClient] | None = None,
        mailer: Optional[EmailSenderProtocol] = None,
        clock: Optional[Callable[[], datetime]] = None,
        window_hours: int = 24,
        min_priority: int = 60,
    ) -> None:
        self._database = database
        self._http_client_factory = http_client_factory or self._default_client_factory
        self._mailer = mailer or EmailPlaceholder()
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._window = timedelta(hours=window_hours)
        self._min_priority = min_priority
        self._lock = asyncio.Lock()

    async def run(self, config: StarlinkerConfig, *, triggered_at: datetime) -> dict[str, object]:
        async with self._lock:
            return await self._run_locked(config, triggered_at=triggered_at)

    async def _run_locked(self, config: StarlinkerConfig, *, triggered_at: datetime) -> dict[str, object]:
        candidates = self._collect_candidates(config, triggered_at=triggered_at)
        if not candidates:
            return {"alerts": 0, "suppressed": False}
        if self._in_quiet_hours(config, triggered_at):
            return {"alerts": 0, "suppressed": True}

        delivered_total = 0
        async with self._http_client_factory() as client:
            for candidate in candidates:
                delivered_channels: List[str] = []
                content = self._render_message(candidate)
                subject = f"[Starlinker] {candidate.signal.title}"
                webhook = config.outputs.discord_webhook.strip()
                if webhook:
                    try:
                        await self._post_discord(client, webhook, content)
                        delivered_channels.append("discord")
                    except Exception as exc:  # pragma: no cover - defensive
                        self._database.record_error(
                            module="alerts.dispatch",
                            message=str(exc),
                            details={"channel": "discord"},
                        )
                email_to = config.outputs.email_to.strip()
                if email_to:
                    try:
                        self._mailer.send(email_to, subject, content)
                        delivered_channels.append("email")
                    except Exception as exc:  # pragma: no cover - defensive
                        self._database.record_error(
                            module="alerts.dispatch",
                            message=str(exc),
                            details={"channel": "email"},
                        )
                if delivered_channels:
                    self._database.record_alert(
                        alert_type="signal",
                        title=candidate.signal.title,
                        url=candidate.signal.url,
                        delivered_channels=delivered_channels,
                        dedup_key=candidate.dedup_key,
                        created_at=triggered_at,
                    )
                    delivered_total += 1
        return {"alerts": delivered_total, "suppressed": False}

    # Candidate helpers -------------------------------------------------

    def _collect_candidates(
        self, config: StarlinkerConfig, *, triggered_at: datetime
    ) -> List[AlertCandidate]:
        since = triggered_at - self._window
        signals = self._database.fetch_signals(since=since)
        candidates: List[AlertCandidate] = []
        for signal in signals:
            priority = self._score_signal(signal)
            if priority < self._min_priority:
                continue
            dedup_key = self._build_dedup_key(signal)
            if self._database.alert_exists(dedup_key):
                continue
            candidates.append(AlertCandidate(signal=signal, priority=priority, dedup_key=dedup_key))
        candidates.sort(key=lambda item: (item.priority, item.signal.published_at), reverse=True)
        return candidates

    def _score_signal(self, signal: StoredSignal) -> int:
        priority = int(signal.priority or 0)
        tags = {tag.lower() for tag in signal.tags}
        if "live" in tags:
            priority = max(priority, 80)
        if "ptu" in tags:
            priority = max(priority, 50)
        lowered = signal.title.lower()
        if "hotfix" in lowered or "critical" in lowered:
            priority = max(priority, 85)
        if "roadmap" in lowered or "status" in lowered:
            priority = max(priority, 60)
        return priority

    def _build_dedup_key(self, signal: StoredSignal) -> str:
        return f"{signal.source}:{signal.url.lower()}"

    def _render_message(self, candidate: AlertCandidate) -> str:
        signal = candidate.signal
        summary = signal.summary or signal.raw_excerpt or ""
        published = signal.published_at.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%d %H:%M UTC")
        lines = [
            f"**{signal.title}**",
            f"Source: {signal.source}",
            f"Published: {published}",
            signal.url,
        ]
        if summary:
            lines.append("")
            lines.append(summary.strip())
        return "\n".join(lines)

    def _in_quiet_hours(self, config: StarlinkerConfig, moment: datetime) -> bool:
        if not config.quiet_hours or len(config.quiet_hours) != 2:
            return False
        try:
            tz = ZoneInfo(config.timezone)
        except ZoneInfoNotFoundError:
            tz = ZoneInfo("UTC")
        local = moment.astimezone(tz)
        start = self._parse_time(config.quiet_hours[0])
        end = self._parse_time(config.quiet_hours[1])
        current = local.time()
        if start <= end:
            return start <= current < end
        return current >= start or current < end

    def _parse_time(self, value: str) -> time:
        hours, minutes = value.split(":", 1)
        return time(hour=int(hours), minute=int(minutes))

    async def _post_discord(self, client: httpx.AsyncClient, url: str, content: str) -> None:
        payload = {"content": content[:1800]}
        response = await client.post(url, json=payload)
        response.raise_for_status()

    @staticmethod
    def _default_client_factory() -> httpx.AsyncClient:
        headers = {"User-Agent": "Starlinker/0.1"}
        timeout = httpx.Timeout(20.0)
        return httpx.AsyncClient(timeout=timeout, headers=headers)


class DigestService:
    """Generate digests from stored signals and dispatch them."""

    def __init__(
        self,
        database: StarlinkerDatabase,
        *,
        http_client_factory: Callable[[], httpx.AsyncClient] | None = None,
        mailer: Optional[EmailSenderProtocol] = None,
        clock: Optional[Callable[[], datetime]] = None,
    ) -> None:
        self._database = database
        self._http_client_factory = http_client_factory or AlertsService._default_client_factory
        self._mailer = mailer or EmailPlaceholder()
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._lock = asyncio.Lock()

    async def run_digest(
        self,
        digest_type: str,
        config: StarlinkerConfig,
        *,
        triggered_at: datetime,
    ) -> dict[str, object]:
        async with self._lock:
            return await self._run_locked(digest_type, config, triggered_at=triggered_at)

    async def _run_locked(
        self,
        digest_type: str,
        config: StarlinkerConfig,
        *,
        triggered_at: datetime,
    ) -> dict[str, object]:
        body, signals = self.generate_digest_body(digest_type, config, triggered_at=triggered_at)
        if not signals:
            return {"digest": digest_type, "sent": False, "signals": 0}
        subject = f"[Starlinker] {digest_type.title()} Digest"
        delivered_channels: List[str] = []
        async with self._http_client_factory() as client:
            webhook = config.outputs.discord_webhook.strip()
            if webhook:
                try:
                    await client.post(webhook, json={"content": body[:1800]})
                    delivered_channels.append("discord")
                except Exception as exc:  # pragma: no cover - defensive
                    self._database.record_error(
                        module="digest.dispatch",
                        message=str(exc),
                        details={"channel": "discord"},
                    )
            email_to = config.outputs.email_to.strip()
            if email_to:
                try:
                    self._mailer.send(email_to, subject, body)
                    delivered_channels.append("email")
                except Exception as exc:  # pragma: no cover - defensive
                    self._database.record_error(
                        module="digest.dispatch",
                        message=str(exc),
                        details={"channel": "email"},
                    )
        if delivered_channels:
            self._database.record_digest(
                digest_type=digest_type,
                body_markdown=body,
                sent_at=triggered_at,
            )
        return {
            "digest": digest_type,
            "sent": bool(delivered_channels),
            "signals": len(signals),
            "channels": delivered_channels,
        }

    def generate_digest_body(
        self,
        digest_type: str,
        config: StarlinkerConfig,
        *,
        triggered_at: Optional[datetime] = None,
    ) -> tuple[str, List[StoredSignal]]:
        window = self._window_for(digest_type)
        moment = triggered_at or self._clock()
        since = moment - window
        signals = self._database.fetch_signals(since=since)
        if not signals:
            return ("", [])
        try:
            tz = ZoneInfo(config.timezone)
        except ZoneInfoNotFoundError:
            tz = ZoneInfo("UTC")
        local_date = moment.astimezone(tz).strftime("%Y-%m-%d")
        header = f"# Starlinker {digest_type.title()} Digest ({local_date})"
        lines = [header, ""]
        for signal in sorted(
            signals,
            key=lambda item: (item.priority, item.published_at),
            reverse=True,
        ):
            published = signal.published_at.astimezone(tz).strftime("%Y-%m-%d %H:%M")
            lines.append(f"- [{signal.title}]({signal.url}) — {published}")
            summary = signal.summary or signal.raw_excerpt
            if summary:
                lines.append(f"  - {summary.strip()[:280]}")
        body = "\n".join(lines)
        return body, signals

    def preview(
        self,
        digest_type: str,
        config: StarlinkerConfig,
        *,
        triggered_at: Optional[datetime] = None,
    ) -> dict[str, object]:
        body, signals = self.generate_digest_body(digest_type, config, triggered_at=triggered_at)
        return {"digest": digest_type, "body": body, "signals": len(signals)}

    def _window_for(self, digest_type: str) -> timedelta:
        if digest_type == "daily":
            return timedelta(days=1)
        if digest_type == "weekly":
            return timedelta(days=7)
        raise ValueError(f"Unsupported digest type: {digest_type}")

