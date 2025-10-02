import { FormEvent, useMemo } from 'react';
import { formatIsoTimestamp } from '../lib/formatIsoTimestamp';
import {
  WIZARD_STEP_ORDER,
  WIZARD_STEPS,
  type WizardDrafts,
  type WizardStepId,
  type WizardStepStatus,
  useWizardStore,
} from '../state/wizardStore';

const STATUS_LABELS: Record<WizardStepStatus | 'incomplete', string> = {
  idle: 'Not started',
  editing: 'Unsaved changes',
  saving: 'Saving…',
  complete: 'Completed',
  incomplete: 'Incomplete',
};

const STATUS_STYLES: Record<WizardStepStatus | 'incomplete', string> = {
  idle: 'bg-slate-700/40 text-slate-200',
  editing: 'bg-amber-500/20 text-amber-200',
  saving: 'bg-amber-500/20 text-amber-100',
  complete: 'bg-emerald-500/20 text-emerald-300',
  incomplete: 'bg-rose-500/20 text-rose-200',
};

type StepContentProps = {
  step: WizardStepId;
  draft: WizardDrafts[WizardStepId];
  onUpdate: (patch: Partial<WizardDrafts[WizardStepId]>) => void;
  disabled?: boolean;
};

export function SetupWizard() {
  const currentStep = useWizardStore((state) => state.currentStep);
  const stepState = useWizardStore((state) => state.steps[state.currentStep]);
  const steps = useWizardStore((state) => state.steps);
  const incomplete = useWizardStore((state) => state.incomplete);
  const setCurrentStep = useWizardStore((state) => state.setCurrentStep);
  const goToNext = useWizardStore((state) => state.goToNextStep);
  const goToPrevious = useWizardStore((state) => state.goToPreviousStep);
  const updateDraft = useWizardStore((state) => state.updateDraft);
  const resetStep = useWizardStore((state) => state.resetStep);
  const skipStep = useWizardStore((state) => state.skipStep);
  const saveStep = useWizardStore((state) => state.saveStep);

  const stepDefinition = useMemo(() => WIZARD_STEPS.find((entry) => entry.id === currentStep) ?? WIZARD_STEPS[0], [currentStep]);
  const isSaving = stepState.status === 'saving';
  const isComplete = stepState.status === 'complete' && !incomplete[currentStep];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveStep(currentStep);
    goToNext();
  };

  const handleSkip = () => {
    skipStep(currentStep);
    goToNext();
  };

  const handleReset = () => {
    resetStep(currentStep);
  };

  const currentIndex = useMemo(() => WIZARD_STEP_ORDER.indexOf(currentStep), [currentStep]);
  const prevStep = currentIndex > 0 ? WIZARD_STEP_ORDER[currentIndex - 1] : undefined;
  const nextStep = currentIndex < WIZARD_STEP_ORDER.length - 1 ? WIZARD_STEP_ORDER[currentIndex + 1] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Startup Wizard</h1>
        <p className="text-sm text-slate-400">
          Walk through the guided setup to configure Starlinker defaults. Each step saves to the local profile and will later
          sync with the backend settings service.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav className="space-y-3 rounded-xl border border-slate-800/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Setup Progress</h2>
          <ul className="space-y-2">
            {WIZARD_STEPS.map((step) => {
              const stateForStep = steps[step.id];
              const isActive = step.id === currentStep;
              const showIncomplete = incomplete[step.id];
              const badgeKey: WizardStepStatus | 'incomplete' =
                stateForStep.status === 'complete' && showIncomplete ? 'incomplete' : stateForStep.status;
              const badgeLabel = STATUS_LABELS[badgeKey];
              const badgeStyle = STATUS_STYLES[badgeKey];

              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(step.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                      isActive
                        ? 'border-brand-500/80 bg-brand-500/10 text-brand-100'
                        : 'border-transparent bg-slate-900/60 text-slate-200 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">{step.title}</span>
                      <span className="text-xs text-slate-400">{step.description}</span>
                    </span>
                    <span className={`ml-3 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${badgeStyle}`}>
                      {badgeLabel}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <form
          className="flex flex-col gap-4 rounded-xl border border-slate-800/70 bg-slate-950/60 p-6"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-400">Step {currentIndex + 1}</span>
            <h2 className="text-2xl font-semibold text-slate-50">{stepDefinition.title}</h2>
            <p className="text-sm text-slate-400">{stepDefinition.description}</p>
            {stepDefinition.helperText ? (
              <p className="text-xs text-slate-500">{stepDefinition.helperText}</p>
            ) : null}
          </div>

          {isComplete ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              <span className="font-medium">Saved.</span> Last updated {formatIsoTimestamp(stepState.lastSaved)}.
            </div>
          ) : null}

          {stepState.status === 'saving' ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              Saving your preferences…
            </div>
          ) : null}

          <div className="space-y-4">
            <StepContent step={currentStep} draft={stepState.draft} disabled={isSaving} onUpdate={(patch) => updateDraft(currentStep, patch)} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
              >
                Reset Step
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
              >
                Skip for Now
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goToPreviousStep()}
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!prevStep}
              >
                Back
              </button>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-700"
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : nextStep ? 'Save & Continue' : 'Save & Finish'}
              </button>
            </div>
          </div>

          <footer className="flex flex-col gap-1 border-t border-slate-800/70 pt-4 text-xs text-slate-500">
            <p>Unsaved edits will mark the associated admin tab as incomplete.</p>
            <p>Saved steps will sync to the FastAPI settings service once backend wiring lands.</p>
          </footer>
        </form>
      </div>
    </div>
  );
}

function StepContent({ step, draft, onUpdate, disabled }: StepContentProps) {
  switch (step) {
    case 'connections': {
      const typedDraft = draft as WizardDrafts['connections'];
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Discord Webhook</span>
            <input
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
              value={typedDraft.discordWebhook}
              onChange={(event) => onUpdate({ discordWebhook: event.target.value })}
              disabled={disabled}
            />
            <span className="text-xs text-slate-500">
              Add the Discord channel webhook URL. Leave blank if you prefer email digests only.
            </span>
          </label>

          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email Recipients</span>
            <input
              type="text"
              placeholder="crew@org.example"
              className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
              value={typedDraft.emailTo}
              onChange={(event) => onUpdate({ emailTo: event.target.value })}
              disabled={disabled}
            />
            <span className="text-xs text-slate-500">Comma-separated addresses for dispatching email alerts.</span>
          </label>
        </div>
      );
    }

    case 'sources': {
      const typedDraft = draft as WizardDrafts['sources'];
      const toggle = (key: keyof WizardDrafts['sources']) =>
        onUpdate({ [key]: !typedDraft[key] } as Partial<WizardDrafts['sources']>);
      const sources: Array<{ key: keyof WizardDrafts['sources']; label: string; description: string }> = [
        { key: 'patchNotes', label: 'RSI Patch Notes', description: 'Official server and PTU patch notes from RSI.' },
        { key: 'roadmap', label: 'Roadmap Roundup', description: 'Weekly roadmap changes and devnotes.' },
        { key: 'status', label: 'Service Status', description: 'Platform uptime posts and scheduled maintenance.' },
        { key: 'thisWeek', label: 'This Week in Star Citizen', description: 'Weekly content schedule posts.' },
        { key: 'insideSC', label: 'Inside Star Citizen', description: 'YouTube uploads from RSI channels.' },
        { key: 'reddit', label: 'Community Reddit Feed', description: 'Hand curated Reddit threads from the verse.' },
      ];

      return (
        <div className="grid gap-3">
          {sources.map((source) => (
            <label
              key={source.key}
              className="flex items-start gap-3 rounded-lg border border-slate-800/60 bg-slate-950/50 p-3 text-sm text-slate-200"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
                checked={typedDraft[source.key]}
                onChange={() => toggle(source.key)}
                disabled={disabled}
              />
              <span className="flex flex-col">
                <span className="font-medium text-slate-100">{source.label}</span>
                <span className="text-xs text-slate-500">{source.description}</span>
              </span>
            </label>
          ))}
        </div>
      );
    }

    case 'schedule': {
      const typedDraft = draft as WizardDrafts['schedule'];
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Daily Digest Time</span>
            <input
              type="time"
              value={typedDraft.digestDaily}
              onChange={(event) => onUpdate({ digestDaily: event.target.value })}
              className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
              disabled={disabled}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Weekly Digest Target</span>
            <input
              type="text"
              value={typedDraft.digestWeekly}
              onChange={(event) => onUpdate({ digestWeekly: event.target.value })}
              placeholder="Friday 15:00"
              className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
              disabled={disabled}
            />
            <span className="text-xs text-slate-500">Set day/time or leave blank to disable the weekly digest.</span>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Priority Poll Interval</span>
            <input
              type="number"
              min={5}
              step={5}
              value={typedDraft.priorityPollMinutes}
              onChange={(event) => onUpdate({ priorityPollMinutes: Number(event.target.value) || 0 })}
              className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
              disabled={disabled}
            />
            <span className="text-xs text-slate-500">Minutes between polls when priority triggers are active.</span>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Standard Poll Interval</span>
            <input
              type="number"
              min={1}
              step={1}
              value={typedDraft.standardPollHours}
              onChange={(event) => onUpdate({ standardPollHours: Number(event.target.value) || 0 })}
              className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
              disabled={disabled}
            />
            <span className="text-xs text-slate-500">Hours between standard polls when in normal cadence.</span>
          </label>
        </div>
      );
    }

    case 'alerts': {
      const typedDraft = draft as WizardDrafts['alerts'];
      return (
        <div className="grid gap-4">
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
              checked={typedDraft.quietHoursEnabled}
              onChange={() => onUpdate({ quietHoursEnabled: !typedDraft.quietHoursEnabled })}
              disabled={disabled}
            />
            <span className="font-medium text-slate-100">Enable quiet hours</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quiet Hours Start</span>
              <input
                type="time"
                value={typedDraft.quietHoursStart}
                onChange={(event) => onUpdate({ quietHoursStart: event.target.value })}
                className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
                disabled={disabled || !typedDraft.quietHoursEnabled}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-200">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quiet Hours End</span>
              <input
                type="time"
                value={typedDraft.quietHoursEnd}
                onChange={(event) => onUpdate({ quietHoursEnd: event.target.value })}
                className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
                disabled={disabled || !typedDraft.quietHoursEnabled}
              />
            </label>
          </div>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Priority Keywords</span>
            <textarea
              rows={3}
              value={typedDraft.priorityKeywords}
              onChange={(event) => onUpdate({ priorityKeywords: event.target.value })}
              className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed"
              placeholder="Alert,Priority,Showcase"
              disabled={disabled}
            />
            <span className="text-xs text-slate-500">
              Alerts containing these comma-separated keywords ignore quiet hours and send immediately.
            </span>
          </label>
        </div>
      );
    }

    case 'digest': {
      const typedDraft = draft as WizardDrafts['digest'];
      return (
        <div className="grid gap-3">
          <label className="flex items-start gap-3 rounded-lg border border-slate-800/60 bg-slate-950/50 p-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
              checked={typedDraft.dailyDigest}
              onChange={() => onUpdate({ dailyDigest: !typedDraft.dailyDigest })}
              disabled={disabled}
            />
            <span className="flex flex-col">
              <span className="font-medium text-slate-100">Daily digest</span>
              <span className="text-xs text-slate-500">A morning summary of the last 24 hours of Star Citizen updates.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-slate-800/60 bg-slate-950/50 p-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
              checked={typedDraft.weeklyDigest}
              onChange={() => onUpdate({ weeklyDigest: !typedDraft.weeklyDigest })}
              disabled={disabled}
            />
            <span className="flex flex-col">
              <span className="font-medium text-slate-100">Weekly digest</span>
              <span className="text-xs text-slate-500">A longer-form wrap-up with curated highlights each Friday.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-slate-800/60 bg-slate-950/50 p-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
              checked={typedDraft.includeHighlights}
              onChange={() => onUpdate({ includeHighlights: !typedDraft.includeHighlights })}
              disabled={disabled}
            />
            <span className="flex flex-col">
              <span className="font-medium text-slate-100">Include highlights module</span>
              <span className="text-xs text-slate-500">Adds notable Reddit threads and official videos to each digest.</span>
            </span>
          </label>
        </div>
      );
    }

    default:
      return null;
  }
}
