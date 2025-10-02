import { FormEvent, useEffect, useMemo } from 'react';
import { formatIsoTimestamp } from '../lib/formatIsoTimestamp';
import { useSettingsStore } from '../state/settingsStore';

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

export function SettingsEditor() {
  const status = useSettingsStore((state) => state.status);
  const error = useSettingsStore((state) => state.error);
  const draft = useSettingsStore((state) => state.draft);
  const validationIssues = useSettingsStore((state) => state.validationIssues);
  const lastLoaded = useSettingsStore((state) => state.lastLoaded);
  const lastSaved = useSettingsStore((state) => state.lastSaved);
  const setDraft = useSettingsStore((state) => state.setDraft);
  const resetDraft = useSettingsStore((state) => state.resetDraft);
  const applyDefaultsToDraft = useSettingsStore((state) => state.applyDefaultsToDraft);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const saveDraft = useSettingsStore((state) => state.saveDraft);
  const hasDefaults = useSettingsStore((state) => state.defaults !== null);

  useEffect(() => {
    if (status === 'idle') {
      void loadSettings();
    }
  }, [status, loadSettings]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveDraft();
  };

  const statusBadge = useMemo(() => {
    const label = STATUS_LABELS[status] ?? status;
    const style = STATUS_STYLES[status] ?? STATUS_STYLES.idle;
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${style}`}>
        {label}
      </span>
    );
  }, [status]);

  const isBusy = status === 'loading' || status === 'saving';

  return (
    <article className="flex h-full flex-col rounded-xl border border-slate-800/70 bg-slate-900/40 p-5 shadow-lg shadow-slate-950/40">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-slate-100">Settings</h2>
        {statusBadge}
      </div>
      <p className="mt-3 text-sm text-slate-400">
        Review the Starlinker configuration loaded from FastAPI. Adjust values using the JSON editor and save
        directly to the backend, or revert to the persisted settings.
      </p>

      <form className="mt-4 flex flex-1 flex-col space-y-4" onSubmit={handleSubmit}>
        <div className="flex-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Configuration JSON</label>
          <textarea
            className="mt-2 h-64 w-full rounded-lg border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-wait disabled:opacity-60"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            disabled={isBusy}
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {validationIssues.length > 0 ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-300">Validation Issues</h3>
            <ul className="mt-2 space-y-1">
              {validationIssues.map((issue, index) => (
                <li key={`${issue.loc.join('.')}-${index}`} className="flex flex-col">
                  <span className="text-xs font-medium text-amber-200">
                    {issue.loc.length > 0 ? issue.loc.join(' › ') : 'root'}
                  </span>
                  <span className="text-amber-100">{issue.msg}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-700"
            disabled={isBusy}
          >
            {status === 'saving' ? 'Saving…' : 'Save Settings'}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={resetDraft}
            disabled={isBusy}
          >
            Revert to Saved
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={applyDefaultsToDraft}
            disabled={isBusy || !hasDefaults}
          >
            Load Defaults
          </button>
        </div>
      </form>

      <footer className="mt-4 space-y-1 text-xs text-slate-500">
        <p>Last loaded: {formatIsoTimestamp(lastLoaded)}</p>
        <p>Last saved: {formatIsoTimestamp(lastSaved)}</p>
      </footer>

      <details className="mt-4 rounded-lg border border-slate-800/70 bg-slate-950/40 p-3 text-sm text-slate-300">
        <summary className="cursor-pointer text-sm font-medium text-slate-200">Schema Preview</summary>
        <SchemaPreview />
      </details>
    </article>
  );
}

function SchemaPreview() {
  const schema = useSettingsStore((state) => state.schema);
  const status = useSettingsStore((state) => state.status);

  if (status === 'loading' && !schema) {
    return <p className="mt-2 text-xs text-slate-500">Loading schema…</p>;
  }

  if (!schema) {
    return <p className="mt-2 text-xs text-slate-500">Schema unavailable.</p>;
  }

  return (
    <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950/80 p-3 text-xs text-slate-200">
      {JSON.stringify(schema, null, 2)}
    </pre>
  );
}
