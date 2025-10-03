import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getApiBaseUrl } from '../lib/getApiBaseUrl';
import { useAppStore } from '../state/appStore';
import {
  type DeepPartial,
  useSettingsStore,
} from '../state/settingsStore';
import { useToastStore } from '../state/toastStore';
import type { StarlinkerConfig, ValidationIssue } from '../types/settings';
import { SettingsEditor } from '../components/SettingsEditor';
import { formatIsoTimestamp } from '../lib/formatIsoTimestamp';

const STATUS_LABELS: Record<string, string> = {
  idle: 'Idle',
  loading: 'Loading…',
  ready: 'Ready',
  saving: 'Saving…',
  error: 'Error',
};

const STATUS_STYLES: Record<string, string> = {
  idle: 'bg-slate-600/30 text-slate-200',
  loading: 'bg-amber-500/20 text-amber-200',
  ready: 'bg-emerald-500/20 text-emerald-300',
  saving: 'bg-amber-500/20 text-amber-200',
  error: 'bg-rose-500/20 text-rose-200',
};

const PREREQ_TAB_MAP: Record<string, AdminTabId> = {
  digest_output: 'connections',
  timezone: 'schedule',
};

type AdminTabId =
  | 'connections'
  | 'sources'
  | 'schedule'
  | 'alerts'
  | 'digest'
  | 'reddit'
  | 'advanced'
  | 'health'
  | 'appearance';

type SaveHandler = (
  patch: DeepPartial<StarlinkerConfig>,
  context: { success: string; error: string; description?: string },
) => Promise<boolean>;

type TabProps = {
  config: StarlinkerConfig;
  disabled: boolean;
  onSave: SaveHandler;
  validationIssues: ValidationIssue[];
  missingMessages: string[];
};

type RedditTabProps = TabProps & {
  onSaveRedditPatch: (
    patch: DeepPartial<StarlinkerConfig['sources']['reddit']>,
  ) => Promise<boolean>;
};

type HealthState = {
  status: string;
  scheduler: Record<string, unknown>;
  storage: {
    counts?: Record<string, number>;
    last_error?: { module?: string; message?: string; ts?: string } | null;
  };
  alerts?: { snoozed_until?: string | null };
};

const VALIDATION_PREFIXES: Partial<Record<AdminTabId, string[][]>> = {
  connections: [['outputs']],
  sources: [['sources']],
  schedule: [['schedule'], ['timezone']],
  alerts: [['quiet_hours']],
  reddit: [['sources', 'reddit']],
  appearance: [['appearance']],
};

const TAB_TITLES: Record<AdminTabId, string> = {
  connections: 'Connections',
  sources: 'Sources',
  schedule: 'Schedule',
  alerts: 'Alerts',
  digest: 'Digest',
  reddit: 'Reddit',
  advanced: 'Advanced',
  health: 'Health & Logs',
  appearance: 'Appearance',
};

export function AdminConsole() {
  const [activeTab, setActiveTab] = useState<AdminTabId>('connections');
  const status = useSettingsStore((state) => state.status);
  const error = useSettingsStore((state) => state.error);
  const validationIssues = useSettingsStore((state) => state.validationIssues);
  const config = useSettingsStore((state) => state.config);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const patchConfig = useSettingsStore((state) => state.patchConfig);
  const lastLoaded = useSettingsStore((state) => state.lastLoaded);
  const lastSaved = useSettingsStore((state) => state.lastSaved);
  const missingPrereqs = useAppStore((state) => state.missingPrerequisites);
  const setMissingPrereqs = useAppStore((state) => state.setMissingPrerequisites);
  const pushToast = useToastStore((state) => state.push);
  const apiBase = useMemo(() => getApiBaseUrl(), []);

  useEffect(() => {
    if (status === 'idle') {
      void loadSettings();
    }
  }, [status, loadSettings]);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch(`${apiBase}/health`);
        if (!response.ok) {
          throw new Error('Failed to load health state');
        }
        const payload = (await response.json()) as { missing?: string[] };
        if (Array.isArray(payload.missing)) {
          setMissingPrereqs(payload.missing);
        }
      } catch (error) {
        console.error('Failed to load health for prerequisites', error);
      }
    };
    void fetchHealth();
  }, [apiBase, setMissingPrereqs]);

  const statusBadge = useMemo(() => {
    const label = STATUS_LABELS[status] ?? status;
    const style = STATUS_STYLES[status] ?? STATUS_STYLES.idle;
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${style}`}>
        {label}
      </span>
    );
  }, [status]);

  const missingMap = useMemo(() => {
    return missingPrereqs.reduce((acc, key) => {
      const tab = PREREQ_TAB_MAP[key];
      if (tab) {
        acc.add(tab);
      }
      return acc;
    }, new Set<AdminTabId>());
  }, [missingPrereqs]);

  const tabValidationIssues = useMemo(() => {
    const prefixes = VALIDATION_PREFIXES[activeTab];
    if (!prefixes || prefixes.length === 0) {
      return validationIssues;
    }
    return validationIssues.filter((issue) =>
      prefixes.some((prefix) => prefix.every((segment, index) => issue.loc[index] === segment)),
    );
  }, [activeTab, validationIssues]);

  const missingMessages = useMemo(() => {
    const messages: string[] = [];
    if (missingPrereqs.includes('digest_output') && activeTab === 'connections') {
      messages.push('Add a Discord webhook or email recipient so alerts and digests can be delivered.');
    }
    if (missingPrereqs.includes('timezone') && activeTab === 'schedule') {
      messages.push('Select a timezone to ensure schedules and quiet hours run at the correct local time.');
    }
    return messages;
  }, [activeTab, missingPrereqs]);

  const handlePatch = useCallback<SaveHandler>(
    async (patch, context) => {
      const ok = await patchConfig(patch);
      if (ok) {
        pushToast({ tone: 'success', title: context.success, description: context.description });
        try {
          const response = await fetch(`${apiBase}/health`);
          if (response.ok) {
            const payload = (await response.json()) as { missing?: string[] };
            if (Array.isArray(payload.missing)) {
              setMissingPrereqs(payload.missing);
            }
          }
        } catch (error) {
          console.warn('Failed to refresh prerequisites after save', error);
        }
      } else {
        pushToast({ tone: 'error', title: context.error, description: 'Check the validation notices for details.' });
      }
      return ok;
    },
    [apiBase, patchConfig, pushToast, setMissingPrereqs],
  );

  const disabled = status === 'loading' || status === 'saving' || !config;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Admin Console</h1>
            <p className="text-sm text-slate-400">
              Configure Starlinker services, data sources, and presentation. Changes save directly to the FastAPI backend.
            </p>
          </div>
          {statusBadge}
        </div>
        <p className="text-xs text-slate-500">
          Last loaded: {formatIsoTimestamp(lastLoaded)} · Last saved: {formatIsoTimestamp(lastSaved)}
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="space-y-2 rounded-xl border border-slate-800/70 bg-slate-950/60 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Configuration Tabs</h2>
          <ul className="space-y-1">
            {(Object.keys(TAB_TITLES) as AdminTabId[]).map((tab) => (
              <li key={tab}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
                    activeTab === tab
                      ? 'bg-brand-500/10 text-brand-200 shadow-inner shadow-brand-500/20'
                      : 'text-slate-300 hover:bg-slate-900/70 hover:text-slate-100'
                  }`}
                >
                  <span>{TAB_TITLES[tab]}</span>
                  {missingMap.has(tab) ? (
                    <span className="ml-3 inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-rose-500/20 px-2 text-[11px] font-semibold text-rose-200">
                      !
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="space-y-4">
          {!config ? (
            <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 p-6 text-sm text-slate-300">
              Loading configuration…
            </div>
          ) : (
            <>
              {tabValidationIssues.length > 0 ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-300">Validation Issues</h3>
                  <ul className="mt-2 space-y-1">
                    {tabValidationIssues.map((issue, index) => (
                      <li key={`${issue.loc.join('.')}-${index}`}>
                        <span className="font-medium text-amber-200">{issue.loc.join(' › ') || 'root'}:</span>{' '}
                        <span className="text-amber-100">{issue.msg}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {missingMessages.length > 0 ? (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
                  <ul className="list-disc space-y-1 pl-4">
                    {missingMessages.map((message, index) => (
                      <li key={`${message}-${index}`}>{message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {renderTab({
                id: activeTab,
                config,
                disabled,
                onSave: handlePatch,
                validationIssues,
                missingMessages,
              })}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

type RenderTabArgs = {
  id: AdminTabId;
  config: StarlinkerConfig;
  disabled: boolean;
  onSave: SaveHandler;
  validationIssues: ValidationIssue[];
  missingMessages: string[];
};

function renderTab({ id, config, disabled, onSave, validationIssues, missingMessages }: RenderTabArgs) {
  switch (id) {
    case 'connections':
      return (
        <ConnectionsTab
          config={config}
          disabled={disabled}
          onSave={onSave}
          validationIssues={validationIssues}
          missingMessages={missingMessages}
        />
      );
    case 'sources':
      return (
        <SourcesTab
          config={config}
          disabled={disabled}
          onSave={onSave}
          validationIssues={validationIssues}
          missingMessages={missingMessages}
        />
      );
    case 'schedule':
      return (
        <ScheduleTab
          config={config}
          disabled={disabled}
          onSave={onSave}
          validationIssues={validationIssues}
          missingMessages={missingMessages}
        />
      );
    case 'alerts':
      return (
        <AlertsTab
          config={config}
          disabled={disabled}
          onSave={onSave}
          validationIssues={validationIssues}
          missingMessages={missingMessages}
        />
      );
    case 'digest':
      return (
        <DigestTab
          config={config}
          disabled={disabled}
          onSave={onSave}
          validationIssues={validationIssues}
          missingMessages={missingMessages}
        />
      );
    case 'reddit':
      return (
        <RedditTab
          config={config}
          disabled={disabled}
          onSave={onSave}
          validationIssues={validationIssues}
          missingMessages={missingMessages}
        />
      );
    case 'advanced':
      return (
        <AdvancedTab
          config={config}
          disabled={disabled}
          onSave={onSave}
          validationIssues={validationIssues}
          missingMessages={missingMessages}
        />
      );
    case 'health':
      return <HealthTab />;
    case 'appearance':
      return (
        <AppearanceTab
          config={config}
          disabled={disabled}
          onSave={onSave}
          validationIssues={validationIssues}
          missingMessages={missingMessages}
        />
      );
    default:
      return null;
  }
}

function fieldError(validationIssues: ValidationIssue[], path: string[]): string | undefined {
  const joined = path.join('.');
  const match = validationIssues.find((issue) => issue.loc.join('.') === joined);
  return match?.msg;
}

function ConnectionsTab({ config, disabled, onSave, validationIssues }: TabProps) {
  const [webhook, setWebhook] = useState(config.outputs.discord_webhook);
  const [emailTo, setEmailTo] = useState(config.outputs.email_to);
  const webhookError = fieldError(validationIssues, ['outputs', 'discord_webhook']);
  const emailError = fieldError(validationIssues, ['outputs', 'email_to']);

  useEffect(() => {
    setWebhook(config.outputs.discord_webhook);
    setEmailTo(config.outputs.email_to);
  }, [config.outputs.discord_webhook, config.outputs.email_to]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave(
      { outputs: { discord_webhook: webhook, email_to: emailTo } },
      {
        success: 'Connections updated',
        error: 'Failed to update connections',
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-lg shadow-slate-950/30"
    >
      <header>
        <h2 className="text-xl font-semibold text-slate-100">Alert & Digest Outputs</h2>
        <p className="text-sm text-slate-400">
          Configure destinations for alerts and digests. At least one output is required to deliver notifications.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Discord Webhook</span>
          <input
            type="url"
            className={`rounded-lg border bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed ${
              webhookError ? 'border-rose-500/70' : 'border-slate-800'
            }`}
            value={webhook}
            onChange={(event) => setWebhook(event.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            disabled={disabled}
          />
          {webhookError ? <span className="text-xs text-rose-300">{webhookError}</span> : null}
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email Recipients</span>
          <input
            type="email"
            className={`rounded-lg border bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed ${
              emailError ? 'border-rose-500/70' : 'border-slate-800'
            }`}
            value={emailTo}
            onChange={(event) => setEmailTo(event.target.value)}
            placeholder="crew@org.example"
            disabled={disabled}
          />
          {emailError ? <span className="text-xs text-rose-300">{emailError}</span> : null}
        </label>
      </div>
      <footer className="flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-700"
          disabled={disabled}
        >
          Save Connections
        </button>
      </footer>
    </form>
  );
}

function SourcesTab({ config, disabled, onSave, validationIssues }: TabProps) {
  const [sources, setSources] = useState(config.sources);
  const toggleSource = (key: keyof typeof config.sources) => {
    setSources((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        enabled: !prev[key].enabled,
      },
    }));
  };
  const insideChannelsError = fieldError(validationIssues, ['sources', 'inside_sc', 'channels']);

  useEffect(() => {
    setSources(config.sources);
  }, [config.sources]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave(
      { sources },
      {
        success: 'Sources updated',
        error: 'Failed to update sources',
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-lg shadow-slate-950/30"
    >
      <header>
        <h2 className="text-xl font-semibold text-slate-100">Content Sources</h2>
        <p className="text-sm text-slate-400">
          Toggle the Star Citizen sources that Starlinker ingests. Disable streams you do not need to reduce noise.
        </p>
      </header>
      <div className="grid gap-3">
        {(
          [
            ['patch_notes', 'RSI Patch Notes'],
            ['roadmap', 'Roadmap Roundup'],
            ['status', 'Service Status'],
            ['this_week', 'This Week in Star Citizen'],
            ['inside_sc', 'Inside Star Citizen'],
            ['reddit', 'Curated Reddit Highlights'],
          ] as Array<[keyof typeof config.sources, string]>
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-950/50 px-4 py-3 text-sm text-slate-200"
          >
            <span className="font-medium text-slate-100">{label}</span>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
              checked={Boolean(sources[key].enabled)}
              onChange={() => toggleSource(key)}
              disabled={disabled}
            />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-2 text-sm text-slate-200">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Inside Star Citizen Channels</span>
        <input
          type="text"
          className={`rounded-lg border bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed ${
            insideChannelsError ? 'border-rose-500/70' : 'border-slate-800'
          }`}
          value={sources.inside_sc.channels.join(', ')}
          onChange={(event) =>
            setSources((prev) => ({
              ...prev,
              inside_sc: {
                ...prev.inside_sc,
                channels: event.target.value
                  .split(',')
                  .map((channel) => channel.trim())
                  .filter(Boolean),
              },
            }))
          }
          placeholder="rsi_official, isc_extras"
          disabled={disabled}
        />
        {insideChannelsError ? <span className="text-xs text-rose-300">{insideChannelsError}</span> : null}
      </label>
      <footer className="flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-700"
          disabled={disabled}
        >
          Save Sources
        </button>
      </footer>
    </form>
  );
}

function ScheduleTab({ config, disabled, onSave, validationIssues }: TabProps) {
  const [timezone, setTimezone] = useState(config.timezone);
  const [daily, setDaily] = useState(config.schedule.digest_daily);
  const [weekly, setWeekly] = useState(config.schedule.digest_weekly);
  const [priorityMinutes, setPriorityMinutes] = useState(config.schedule.priority_poll_minutes);
  const [standardHours, setStandardHours] = useState(config.schedule.standard_poll_hours);
  const timezoneError = fieldError(validationIssues, ['timezone']);
  const dailyError = fieldError(validationIssues, ['schedule', 'digest_daily']);
  const weeklyError = fieldError(validationIssues, ['schedule', 'digest_weekly']);

  useEffect(() => {
    setTimezone(config.timezone);
    setDaily(config.schedule.digest_daily);
    setWeekly(config.schedule.digest_weekly);
    setPriorityMinutes(config.schedule.priority_poll_minutes);
    setStandardHours(config.schedule.standard_poll_hours);
  }, [config]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave(
      {
        timezone,
        schedule: {
          digest_daily: daily,
          digest_weekly: weekly,
          priority_poll_minutes: priorityMinutes,
          standard_poll_hours: standardHours,
        },
      },
      {
        success: 'Schedule updated',
        error: 'Failed to update schedule',
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-lg shadow-slate-950/30"
    >
      <header>
        <h2 className="text-xl font-semibold text-slate-100">Scheduling</h2>
        <p className="text-sm text-slate-400">
          Configure the timezone and polling cadence for Starlinker. Times use 24-hour format and respect your local zone.
        </p>
      </header>
      <label className="flex flex-col gap-2 text-sm text-slate-200">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Timezone</span>
        <input
          type="text"
          className={`rounded-lg border bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed ${
            timezoneError ? 'border-rose-500/70' : 'border-slate-800'
          }`}
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          placeholder="America/New_York"
          disabled={disabled}
        />
        {timezoneError ? <span className="text-xs text-rose-300">{timezoneError}</span> : null}
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Daily Digest Time</span>
          <input
            type="time"
            className={`rounded-lg border bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed ${
              dailyError ? 'border-rose-500/70' : 'border-slate-800'
            }`}
            value={daily}
            onChange={(event) => setDaily(event.target.value)}
            disabled={disabled}
          />
          {dailyError ? <span className="text-xs text-rose-300">{dailyError}</span> : null}
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Weekly Digest Target</span>
          <input
            type="text"
            className={`rounded-lg border bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed ${
              weeklyError ? 'border-rose-500/70' : 'border-slate-800'
            }`}
            value={weekly}
            onChange={(event) => setWeekly(event.target.value)}
            placeholder="Friday 15:00"
            disabled={disabled}
          />
          {weeklyError ? <span className="text-xs text-rose-300">{weeklyError}</span> : null}
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Priority Poll Interval (minutes)</span>
          <input
            type="number"
            min={5}
            step={5}
            className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
            value={priorityMinutes}
            onChange={(event) => setPriorityMinutes(Number(event.target.value) || 0)}
            disabled={disabled}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Standard Poll Interval (hours)</span>
          <input
            type="number"
            min={1}
            step={1}
            className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
            value={standardHours}
            onChange={(event) => setStandardHours(Number(event.target.value) || 0)}
            disabled={disabled}
          />
        </label>
      </div>
      <footer className="flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-700"
          disabled={disabled}
        >
          Save Schedule
        </button>
      </footer>
    </form>
  );
}

function AlertsTab({ config, disabled, onSave }: TabProps) {
  const [start, setStart] = useState(config.quiet_hours[0] ?? '23:00');
  const [end, setEnd] = useState(config.quiet_hours[1] ?? '07:00');

  useEffect(() => {
    setStart(config.quiet_hours[0] ?? '23:00');
    setEnd(config.quiet_hours[1] ?? '07:00');
  }, [config.quiet_hours]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave(
      { quiet_hours: [start, end] },
      {
        success: 'Quiet hours updated',
        error: 'Failed to update quiet hours',
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-lg shadow-slate-950/30"
    >
      <header>
        <h2 className="text-xl font-semibold text-slate-100">Quiet Hours</h2>
        <p className="text-sm text-slate-400">
          Suppress non-priority alerts during downtime. Times respect the configured timezone on the Schedule tab.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quiet Hours Start</span>
          <input
            type="time"
            className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quiet Hours End</span>
          <input
            type="time"
            className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            disabled={disabled}
          />
        </label>
      </div>
      <footer className="flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-700"
          disabled={disabled}
        >
          Save Quiet Hours
        </button>
      </footer>
    </form>
  );
}

function DigestTab({ disabled }: TabProps) {
  const [digestType, setDigestType] = useState<'daily' | 'weekly'>('daily');
  const [preview, setPreview] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const pushToast = useToastStore((state) => state.push);
  const apiBase = useMemo(() => getApiBaseUrl(), []);

  const handlePreview = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${apiBase}/digest/preview?digest_type=${digestType}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { body?: string };
      setPreview(payload.body ?? 'No preview content available.');
      pushToast({ tone: 'success', title: 'Digest preview refreshed' });
    } catch (error) {
      pushToast({ tone: 'error', title: 'Failed to load digest preview', description: String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTrigger = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${apiBase}/run/digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: digestType }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { triggered_at?: string };
      pushToast({
        tone: 'success',
        title: 'Digest triggered',
        description: payload.triggered_at ? `Requested at ${payload.triggered_at}` : undefined,
      });
    } catch (error) {
      pushToast({ tone: 'error', title: 'Failed to trigger digest', description: String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-lg shadow-slate-950/30">
      <header>
        <h2 className="text-xl font-semibold text-slate-100">Digest Tools</h2>
        <p className="text-sm text-slate-400">Preview and manually trigger digests for verification or urgent dispatches.</p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Digest Type</span>
          <select
            className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            value={digestType}
            onChange={(event) => setDigestType(event.target.value as 'daily' | 'weekly')}
            disabled={disabled || isLoading}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePreview}
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled || isLoading}
          >
            Preview Digest
          </button>
          <button
            type="button"
            onClick={handleTrigger}
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-700"
            disabled={disabled || isLoading}
          >
            Trigger Digest
          </button>
        </div>
      </div>
      <pre className="max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-xs text-slate-200">
        {preview || 'Run a preview to view the latest digest draft.'}
      </pre>
    </div>
  );
}

function RedditTab({ config, disabled, onSave, validationIssues }: TabProps) {
  const [reddit, setReddit] = useState(config.sources.reddit);
  const listFields: Array<{ key: keyof typeof reddit; label: string; placeholder?: string }> = [
    { key: 'subs', label: 'Subreddits (comma separated)', placeholder: 'starcitizen, sc_leaks' },
    { key: 'feed', label: 'Feed Types', placeholder: 'new, hot' },
    { key: 'include_keywords', label: 'Include Keywords' },
    { key: 'exclude_keywords', label: 'Exclude Keywords' },
    { key: 'exclude_flairs', label: 'Exclude Flairs' },
  ];

  useEffect(() => {
    setReddit(config.sources.reddit);
  }, [config.sources.reddit]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave(
      { sources: { reddit } },
      {
        success: 'Reddit source updated',
        error: 'Failed to update Reddit source',
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-lg shadow-slate-950/30"
    >
      <header>
        <h2 className="text-xl font-semibold text-slate-100">Reddit Signal Tuning</h2>
        <p className="text-sm text-slate-400">
          Control which Reddit threads qualify for highlights and alerts. Lists accept comma-separated values.
        </p>
      </header>
      <label className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-950/50 px-4 py-3 text-sm text-slate-200">
        <span className="font-medium text-slate-100">Enable Reddit ingestion</span>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
          checked={reddit.enabled}
          onChange={() => setReddit((prev) => ({ ...prev, enabled: !prev.enabled }))}
          disabled={disabled}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-slate-200">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Minimum Upvotes</span>
        <input
          type="number"
          min={0}
          className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
          value={reddit.min_upvotes}
          onChange={(event) => setReddit((prev) => ({ ...prev, min_upvotes: Number(event.target.value) || 0 }))}
          disabled={disabled}
        />
      </label>
      {listFields.map((field) => {
        const error = fieldError(validationIssues, ['sources', 'reddit', field.key as string]);
        return (
          <label key={field.key as string} className="flex flex-col gap-2 text-sm text-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{field.label}</span>
            <input
              type="text"
              className={`rounded-lg border bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed ${
                error ? 'border-rose-500/70' : 'border-slate-800'
              }`}
              value={(reddit[field.key] as string[]).join(', ')}
              onChange={(event) =>
                setReddit((prev) => ({
                  ...prev,
                  [field.key]: event.target.value
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                }))
              }
              placeholder={field.placeholder}
              disabled={disabled}
            />
            {error ? <span className="text-xs text-rose-300">{error}</span> : null}
          </label>
        );
      })}
      <footer className="flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-700"
          disabled={disabled}
        >
          Save Reddit Settings
        </button>
      </footer>
    </form>
  );
}

function AdvancedTab(_: TabProps) {
  return <SettingsEditor />;
}

function HealthTab() {
  const [health, setHealth] = useState<HealthState | null>(null);
  const [loading, setLoading] = useState(false);
  const pushToast = useToastStore((state) => state.push);
  const apiBase = useMemo(() => getApiBaseUrl(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/health`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as HealthState;
      setHealth(payload);
    } catch (error) {
      pushToast({ tone: 'error', title: 'Failed to refresh health', description: String(error) });
    } finally {
      setLoading(false);
    }
  }, [apiBase, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-lg shadow-slate-950/30">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Operational Health</h2>
          <p className="text-sm text-slate-400">Snapshot of scheduler activity, stored data counts, and recent errors.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      {health ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-slate-800/60 bg-slate-950/50 p-4 text-sm text-slate-200">
            <h3 className="text-sm font-semibold text-slate-100">Scheduler</h3>
            <dl className="mt-2 space-y-2 text-xs text-slate-400">
              <div className="flex justify-between">
                <dt>Status</dt>
                <dd className="text-slate-100">{health.scheduler?.running ? 'Running' : 'Stopped'}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Last Poll</dt>
                <dd className="text-slate-100">{String(health.scheduler?.last_poll ?? '—')}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Last Poll Reason</dt>
                <dd className="text-slate-100">{String(health.scheduler?.last_poll_reason ?? '—')}</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-lg border border-slate-800/60 bg-slate-950/50 p-4 text-sm text-slate-200">
            <h3 className="text-sm font-semibold text-slate-100">Storage</h3>
            <ul className="mt-2 space-y-1 text-xs text-slate-400">
              {Object.entries(health.storage?.counts ?? {}).map(([key, value]) => (
                <li key={key} className="flex justify-between">
                  <span>{key}</span>
                  <span className="text-slate-100">{value}</span>
                </li>
              ))}
            </ul>
            {health.storage?.last_error ? (
              <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-100">
                <p className="font-semibold text-rose-200">Most recent error</p>
                <p className="mt-1">Module: {health.storage.last_error.module}</p>
                <p className="mt-1">Message: {health.storage.last_error.message}</p>
                <p className="mt-1 text-[11px] text-rose-200/80">At: {health.storage.last_error.ts}</p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">No errors recorded.</p>
            )}
          </section>
        </div>
      ) : (
        <p className="text-sm text-slate-400">Loading health snapshot…</p>
      )}
      {health?.alerts?.snoozed_until ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          Alerts snoozed until {health.alerts.snoozed_until}.
        </div>
      ) : null}
    </div>
  );
}

function AppearanceTab({ config, disabled, onSave, validationIssues }: TabProps) {
  const [themes, setThemes] = useState<string[]>([]);
  const [selected, setSelected] = useState(config.appearance.theme);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [autoLaunchSupported, setAutoLaunchSupported] = useState(false);
  const themeError = fieldError(validationIssues, ['appearance', 'theme']);
  const pushToast = useToastStore((state) => state.push);
  const apiBase = useMemo(() => getApiBaseUrl(), []);

  useEffect(() => {
    setSelected(config.appearance.theme);
  }, [config.appearance.theme]);

  useEffect(() => {
    const loadThemes = async () => {
      try {
        const response = await fetch(`${apiBase}/appearance/themes`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as { themes?: string[] };
        setThemes(payload.themes ?? []);
      } catch (error) {
        pushToast({ tone: 'error', title: 'Failed to load themes', description: String(error) });
      }
    };
    void loadThemes();
  }, [apiBase, pushToast]);

  useEffect(() => {
    if (!window.starlinker?.autostart) {
      setAutoLaunchSupported(false);
      return;
    }
    window.starlinker.autostart
      .get()
      .then((result) => {
        setAutoLaunchSupported(result.supported);
        setAutoLaunch(result.enabled);
      })
      .catch((error) => {
        console.error('Failed to query auto-launch', error);
        setAutoLaunchSupported(false);
      });
  }, []);

  const handleThemeChange = async (value: string) => {
    const previous = selected;
    setSelected(value);
    const success = await onSave(
      { appearance: { theme: value } },
      {
        success: 'Theme updated',
        error: 'Failed to update theme',
      },
    );
    if (!success) {
      setSelected(previous);
    }
  };

  const handleAutoLaunchToggle = async () => {
    if (!window.starlinker?.autostart) {
      return;
    }
    try {
      const result = await window.starlinker.autostart.set(!autoLaunch);
      setAutoLaunch(result.enabled);
      pushToast({
        tone: 'success',
        title: result.enabled ? 'Auto-launch enabled' : 'Auto-launch disabled',
      });
    } catch (error) {
      pushToast({ tone: 'error', title: 'Failed to update auto-launch', description: String(error) });
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-lg shadow-slate-950/30">
      <header>
        <h2 className="text-xl font-semibold text-slate-100">Appearance</h2>
        <p className="text-sm text-slate-400">Choose the Starlinker theme and control Windows auto-start behaviour.</p>
      </header>
      <label className="flex flex-col gap-2 text-sm text-slate-200">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Theme</span>
        <select
          className={`rounded-lg border bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed ${
            themeError ? 'border-rose-500/70' : 'border-slate-800'
          }`}
          value={selected}
          onChange={(event) => void handleThemeChange(event.target.value)}
          disabled={disabled}
        >
          {themes.length === 0 ? <option value={selected}>{selected}</option> : null}
          {themes.map((theme) => (
            <option key={theme} value={theme}>
              {theme}
            </option>
          ))}
        </select>
        {themeError ? <span className="text-xs text-rose-300">{themeError}</span> : null}
      </label>
      <div className="rounded-lg border border-slate-800/60 bg-slate-950/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-100">Launch Starlinker at login</p>
            <p className="text-xs text-slate-400">
              Available on Windows via the Start-up apps settings. Toggle requires administrator approval in managed environments.
            </p>
          </div>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
              checked={autoLaunch}
              onChange={handleAutoLaunchToggle}
              disabled={!autoLaunchSupported}
            />
            <span className="text-sm text-slate-300">
              {autoLaunchSupported ? (autoLaunch ? 'Enabled' : 'Disabled') : 'Unavailable on this platform'}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    starlinker?: {
      autostart?: {
        get: () => Promise<{ supported: boolean; enabled: boolean }>;
        set: (enabled: boolean) => Promise<{ supported: boolean; enabled: boolean }>;
      };
    };
  }
}
