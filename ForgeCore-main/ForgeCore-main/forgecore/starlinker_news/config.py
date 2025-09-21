"""Configuration models and helpers for Starlinker."""

from __future__ import annotations

from typing import List, Sequence

from pydantic import BaseModel, ConfigDict, Field, field_validator

THEME_SLUGS: Sequence[str] = ("neutral", "uee", "crusader", "drake", "rsi")


class OutputsConfig(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    discord_webhook: str = ""
    email_to: str = ""


class PatchNotesConfig(BaseModel):
    enabled: bool = True
    include_ptu: bool = False


class RoadmapConfig(BaseModel):
    enabled: bool = True


class StatusConfig(BaseModel):
    enabled: bool = True


class ThisWeekConfig(BaseModel):
    enabled: bool = True


class InsideStarCitizenConfig(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    enabled: bool = True
    channels: List[str] = Field(default_factory=lambda: ["rsi_official"])


class RedditSourceConfig(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    enabled: bool = False
    subs: List[str] = Field(default_factory=lambda: ["starcitizen"])
    feed: List[str] = Field(default_factory=lambda: ["new"])
    min_upvotes: int = 50
    include_keywords: List[str] = Field(default_factory=list)
    exclude_keywords: List[str] = Field(default_factory=list)
    exclude_flairs: List[str] = Field(default_factory=list)


class SourcesConfig(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    patch_notes: PatchNotesConfig = PatchNotesConfig()
    roadmap: RoadmapConfig = RoadmapConfig()
    status: StatusConfig = StatusConfig()
    this_week: ThisWeekConfig = ThisWeekConfig()
    inside_sc: InsideStarCitizenConfig = InsideStarCitizenConfig()
    reddit: RedditSourceConfig = RedditSourceConfig()


class ScheduleConfig(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    digest_daily: str = "09:00"
    digest_weekly: str = ""
    priority_poll_minutes: int = 60
    standard_poll_hours: int = 6


class AppearanceConfig(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    theme: str = "neutral"

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, value: str) -> str:
        if value not in THEME_SLUGS:
            raise ValueError(f"theme '{value}' is not recognised")
        return value


class StarlinkerConfig(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    timezone: str = "America/New_York"
    quiet_hours: List[str] = Field(default_factory=lambda: ["23:00", "07:00"])
    schedule: ScheduleConfig = ScheduleConfig()
    outputs: OutputsConfig = OutputsConfig()
    sources: SourcesConfig = SourcesConfig()
    appearance: AppearanceConfig = AppearanceConfig()

    @field_validator("quiet_hours")
    @classmethod
    def validate_quiet_hours(cls, value: List[str]) -> List[str]:
        if len(value) != 2:
            raise ValueError("quiet_hours must define start and end")
        return value
