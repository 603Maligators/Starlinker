import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../state/appStore';
import { getApiBaseUrl } from '../lib/getApiBaseUrl';
import { formatIsoTimestamp } from '../lib/formatIsoTimestamp';
import { SettingsEditor } from '../components/SettingsEditor';
import { useWizardStore, WIZARD_STEP_ORDER, WIZARD_STEPS } from '../state/wizardStore';

type HealthResponse = {
  status?: string;
  version?: string;
  missing?: string[];
};

export function Dashboard() {
  const backendHealth = useAppStore((state) => state.backendHealth);
  const setBackendHealth = useAppStore((state) => state.setBackendHealth);
  const updateBackendHealth = useAppStore((state) => state.updateBackendHealth);
  const setMissingPrerequisites = useAppStore((state) => state.setMissingPrerequisites);
  const navigate = useNavigate();
  const startWizard = useWizardStore((state) => state.startWizard);
  const incompleteSteps = useWizardStore((state) =>
    WIZARD_STEP_ORDER.filter((step) => state.incomplete[step]),
  );
  const stepStates = useWizardStore((state) => state.steps);
  const [isChecking, setIsChecking] = useState(false);
  const apiBase = useMemo(() => getApiBaseUrl(), []);

  const completedCount = useMemo(() => WIZARD_STEP_ORDER.length - incompleteSteps.length, [incompleteSteps.length]);
  const totalSteps = WIZARD_STEP_ORDER.length;
  const percentComplete = useMemo(
    () => Math.round((completedCount / totalSteps) * 100),
    [completedCount, totalSteps],
  );
  const nextStepDefinition = useMemo(() => {
    if (incompleteSteps.length === 0) {
      return undefined;
    }
    const next = incompleteSteps[0];
    return WIZARD_STEPS.find((entry) => entry.id === next);
  }, [incompleteSteps]);

  const handleResumeWizard = () => {
    startWizard(incompleteSteps[0]);
    navigate('/setup');
  };

  const runHealthCheck = useCallback(async () => {
    setIsChecking(true);
    updateBackendHealth({ status: 'checking' });
    const started = performance.now();
    try {
      const response = await fetch(`${apiBase}/health`);
      const latency = Math.round(performance.now() - started);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as HealthResponse;
      setBackendHealth({
        status: 'healthy',
        lastChecked: new Date().toISOString(),
        message: payload.status ?? 'ok',
        latencyMs: latency,
        version: payload.version ?? 'unknown',
      });
      if (Array.isArray(payload.missing)) {
        setMissingPrerequisites(payload.missing);
      }
    } catch (error) {
      setBackendHealth({
        status: 'unreachable',
        lastChecked: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Failed to reach backend',
      });
      setMissingPrerequisites([]);
    } finally {
      setIsChecking(false);
    }
  }, [apiBase, setBackendHealth, setMissingPrerequisites, updateBackendHealth]);

  useEffect(() => {
    let mounted = true;
    const guardedCheck = async () => {
      if (!mounted) {
        return;
      }
      await runHealthCheck();
    };
    guardedCheck();
    const interval = window.setInterval(guardedCheck, 10000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [runHealthCheck]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">System Overview</h1>
        <p className="text-sm text-slate-400">
          Monitor the Starlinker backend status and confirm connectivity from the renderer shell.
        </p>
      </header>

      <article className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-5 shadow-lg shadow-slate-950/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-slate-100">Startup Wizard Progress</h2>
            <p className="text-sm text-slate-400">
              {incompleteSteps.length === 0
                ? 'All setup steps are saved. You are ready to configure advanced modules.'
                : nextStepDefinition
                ? `Next up: ${nextStepDefinition.title}. ${nextStepDefinition.description}`
                : 'Resume the guided setup to finish wiring Starlinker defaults.'}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${percentComplete}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {completedCount} of {totalSteps} steps completed ({percentComplete}%).
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-72">
            <button
              type="button"
              onClick={handleResumeWizard}
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-700"
              disabled={incompleteSteps.length === 0}
            >
              {incompleteSteps.length === 0 ? 'Setup Complete' : 'Resume Guided Setup'}
            </button>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 text-xs text-slate-400">
              <p className="font-semibold text-slate-200">Step Status</p>
              <ul className="mt-2 space-y-1">
                {WIZARD_STEP_ORDER.map((step) => {
                  const state = stepStates[step];
                  const definition = WIZARD_STEPS.find((entry) => entry.id === step);
                  const label = definition ? definition.title : step;
                  const status = state.status === 'complete' && !incompleteSteps.includes(step)
                    ? 'Complete'
                    : state.status === 'saving'
                    ? 'Saving…'
                    : state.status === 'editing'
                    ? 'Unsaved edits'
                    : 'Incomplete';
                  return (
                    <li key={step} className="flex justify-between">
                      <span>{label}</span>
                      <span className="text-slate-300">{status}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </article>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-5 shadow-lg shadow-slate-950/40">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-slate-100">Backend Health</h2>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                backendHealth.status === 'healthy'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : backendHealth.status === 'unreachable'
                  ? 'bg-rose-500/20 text-rose-300'
                  : backendHealth.status === 'checking'
                  ? 'bg-amber-500/20 text-amber-200'
                  : 'bg-slate-500/20 text-slate-200'
              }`}
            >
              {backendHealth.status === 'healthy'
                ? 'Healthy'
                : backendHealth.status === 'unreachable'
                ? 'Unreachable'
                : backendHealth.status === 'checking'
                ? 'Checking'
                : 'Unknown'}
            </span>
          </div>

          <dl className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="flex justify-between">
              <dt className="text-slate-400">Last Checked</dt>
              <dd className="font-medium text-slate-100">{formatIsoTimestamp(backendHealth.lastChecked)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Message</dt>
              <dd className="font-medium text-slate-100">{backendHealth.message ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Latency</dt>
              <dd className="font-medium text-slate-100">
                {backendHealth.latencyMs != null ? `${backendHealth.latencyMs} ms` : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Backend Version</dt>
              <dd className="font-medium text-slate-100">{backendHealth.version ?? '—'}</dd>
            </div>
          </dl>

          <button
            type="button"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-700"
            onClick={runHealthCheck}
            disabled={isChecking}
          >
            {isChecking ? 'Checking…' : 'Re-run Health Check'}
          </button>
        </article>

        <SettingsEditor />
      </section>
    </div>
  );
}
