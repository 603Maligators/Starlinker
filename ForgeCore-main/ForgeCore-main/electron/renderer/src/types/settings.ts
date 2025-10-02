export type QuietHourRange = [string, string];

export interface OutputsConfig {
  discord_webhook: string;
  email_to: string;
}

export interface PatchNotesConfig {
  enabled: boolean;
  include_ptu: boolean;
}

export interface RoadmapConfig {
  enabled: boolean;
}

export interface StatusConfig {
  enabled: boolean;
}

export interface ThisWeekConfig {
  enabled: boolean;
}

export interface InsideStarCitizenConfig {
  enabled: boolean;
  channels: string[];
}

export interface RedditSourceConfig {
  enabled: boolean;
  subs: string[];
  feed: string[];
  min_upvotes: number;
  include_keywords: string[];
  exclude_keywords: string[];
  exclude_flairs: string[];
}

export interface SourcesConfig {
  patch_notes: PatchNotesConfig;
  roadmap: RoadmapConfig;
  status: StatusConfig;
  this_week: ThisWeekConfig;
  inside_sc: InsideStarCitizenConfig;
  reddit: RedditSourceConfig;
}

export interface ScheduleConfig {
  digest_daily: string;
  digest_weekly: string;
  priority_poll_minutes: number;
  standard_poll_hours: number;
}

export interface AppearanceConfig {
  theme: string;
}

export interface StarlinkerConfig {
  timezone: string;
  quiet_hours: QuietHourRange;
  schedule: ScheduleConfig;
  outputs: OutputsConfig;
  sources: SourcesConfig;
  appearance: AppearanceConfig;
}

export interface ValidationIssue {
  loc: string[];
  msg: string;
  type?: string;
}

export type SettingsSchema = Record<string, unknown>;
