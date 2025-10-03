import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const WIZARD_STEP_ORDER = ['connections', 'sources', 'schedule', 'alerts', 'digest'] as const;

export type WizardStepId = (typeof WIZARD_STEP_ORDER)[number];

export type WizardStepDefinition = {
  id: WizardStepId;
  title: string;
  description: string;
  helperText?: string;
};

export const WIZARD_STEPS: readonly WizardStepDefinition[] = [
  {
    id: 'connections',
    title: 'Connect Outputs',
    description: 'Tell Starlinker where to send alerts and digests when stories break.',
    helperText: 'Provide a Discord webhook and/or email recipients so notifications reach your team.',
  },
  {
    id: 'sources',
    title: 'Select Sources',
    description: 'Choose which content streams to ingest from RSI and the community.',
    helperText: 'You can always toggle these later from the Sources tab once the admin console is live.',
  },
  {
    id: 'schedule',
    title: 'Scheduling',
    description: 'Configure how often Starlinker polls sources and when to deliver digests.',
    helperText: 'Digest times use 24-hour format and respect your local timezone.',
  },
  {
    id: 'alerts',
    title: 'Quiet Hours & Alerts',
    description: 'Define quiet hours and priority settings so alerts respect your downtime.',
    helperText: 'Quiet hours suppress non-priority alerts while still allowing urgent pings.',
  },
  {
    id: 'digest',
    title: 'Digest Preferences',
    description: 'Decide which summaries Starlinker should compile for you.',
    helperText: 'Daily digests focus on the last 24 hours, while weekly digests add broader highlights.',
  },
] as const;

export type WizardDrafts = {
  connections: {
    discordWebhook: string;
    emailTo: string;
  };
  sources: {
    patchNotes: boolean;
    roadmap: boolean;
    status: boolean;
    thisWeek: boolean;
    insideSC: boolean;
    reddit: boolean;
  };
  schedule: {
    digestDaily: string;
    digestWeekly: string;
    priorityPollMinutes: number;
    standardPollHours: number;
  };
  alerts: {
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    priorityKeywords: string;
  };
  digest: {
    dailyDigest: boolean;
    weeklyDigest: boolean;
    includeHighlights: boolean;
  };
};

export type WizardStepStatus = 'idle' | 'editing' | 'saving' | 'complete';

type WizardStepsState = {
  [K in WizardStepId]: {
    status: WizardStepStatus;
    draft: WizardDrafts[K];
    lastSaved?: string;
  };
};

const INITIAL_DRAFTS: WizardDrafts = {
  connections: {
    discordWebhook: '',
    emailTo: '',
  },
  sources: {
    patchNotes: true,
    roadmap: true,
    status: true,
    thisWeek: true,
    insideSC: true,
    reddit: false,
  },
  schedule: {
    digestDaily: '09:00',
    digestWeekly: 'Friday 15:00',
    priorityPollMinutes: 60,
    standardPollHours: 6,
  },
  alerts: {
    quietHoursEnabled: true,
    quietHoursStart: '23:00',
    quietHoursEnd: '07:00',
    priorityKeywords: 'Alert,Priority,Showcase',
  },
  digest: {
    dailyDigest: true,
    weeklyDigest: true,
    includeHighlights: true,
  },
};

const INITIAL_STEPS_STATE: WizardStepsState = {
  connections: {
    status: 'idle',
    draft: cloneDraft('connections'),
  },
  sources: {
    status: 'idle',
    draft: cloneDraft('sources'),
  },
  schedule: {
    status: 'idle',
    draft: cloneDraft('schedule'),
  },
  alerts: {
    status: 'idle',
    draft: cloneDraft('alerts'),
  },
  digest: {
    status: 'idle',
    draft: cloneDraft('digest'),
  },
};

type IncompleteMap = { [K in WizardStepId]: boolean };

const INITIAL_INCOMPLETE: IncompleteMap = {
  connections: true,
  sources: true,
  schedule: true,
  alerts: true,
  digest: true,
};

export interface WizardState {
  currentStep: WizardStepId;
  steps: WizardStepsState;
  incomplete: IncompleteMap;
  startWizard: (step?: WizardStepId) => void;
  setCurrentStep: (step: WizardStepId) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  updateDraft: (step: WizardStepId, patch: Partial<WizardDrafts[WizardStepId]>) => void;
  resetStep: (step: WizardStepId) => void;
  skipStep: (step: WizardStepId) => void;
  saveStep: (step: WizardStepId) => Promise<void>;
}

function cloneDraft<K extends WizardStepId>(step: K): WizardDrafts[K] {
  return JSON.parse(JSON.stringify(INITIAL_DRAFTS[step])) as WizardDrafts[K];
}

function getFirstIncomplete(state: { incomplete: IncompleteMap }): WizardStepId {
  return WIZARD_STEP_ORDER.find((step) => state.incomplete[step]) ?? WIZARD_STEP_ORDER[0];
}

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      currentStep: WIZARD_STEP_ORDER[0],
      steps: INITIAL_STEPS_STATE,
      incomplete: INITIAL_INCOMPLETE,

      startWizard: (step) => {
        const state = get();
        set({ currentStep: step ?? getFirstIncomplete(state) });
      },

      setCurrentStep: (step) => set({ currentStep: step }),

      goToNextStep: () => {
        const { currentStep } = get();
        const index = WIZARD_STEP_ORDER.indexOf(currentStep);
        const next = WIZARD_STEP_ORDER[index + 1];
        if (next) {
          set({ currentStep: next });
        }
      },

      goToPreviousStep: () => {
        const { currentStep } = get();
        const index = WIZARD_STEP_ORDER.indexOf(currentStep);
        const prev = WIZARD_STEP_ORDER[index - 1];
        if (prev) {
          set({ currentStep: prev });
        }
      },

      updateDraft: (step, patch) => {
        set((state) => {
          const current = state.steps[step];
          return {
            steps: {
              ...state.steps,
              [step]: {
                ...current,
                status: current.status === 'saving' ? current.status : 'editing',
                draft: {
                  ...current.draft,
                  ...patch,
                },
              },
            },
            incomplete: {
              ...state.incomplete,
              [step]: true,
            },
          };
        });
      },

      resetStep: (step) =>
        set((state) => ({
          steps: {
            ...state.steps,
            [step]: {
              status: 'idle',
              draft: cloneDraft(step),
            },
          },
          incomplete: {
            ...state.incomplete,
            [step]: true,
          },
        })),

      skipStep: (step) =>
        set((state) => ({
          steps: {
            ...state.steps,
            [step]: {
              ...state.steps[step],
              status: 'idle',
            },
          },
          incomplete: {
            ...state.incomplete,
            [step]: true,
          },
        })),

      saveStep: async (step) => {
        const { steps } = get();
        if (steps[step].status === 'saving') {
          return;
        }

        set((state) => ({
          steps: {
            ...state.steps,
            [step]: {
              ...state.steps[step],
              status: 'saving',
            },
          },
        }));

        try {
          await new Promise((resolve) => setTimeout(resolve, 800));

          const now = new Date().toISOString();
          set((state) => ({
            steps: {
              ...state.steps,
              [step]: {
                ...state.steps[step],
                status: 'complete',
                lastSaved: now,
              },
            },
            incomplete: {
              ...state.incomplete,
              [step]: false,
            },
          }));
        } finally {
          set((state) => {
            const stepState = state.steps[step];
            if (stepState.status !== 'saving') {
              return {} as Partial<WizardState>;
            }

            return {
              steps: {
                ...state.steps,
                [step]: {
                  ...stepState,
                  status: 'editing',
                },
              },
              incomplete: {
                ...state.incomplete,
                [step]: true,
              },
            };
          });
        }
      },
    }),
    {
      name: 'starlinker-startup-wizard',
      partialize: (state) => ({
        currentStep: state.currentStep,
        steps: state.steps,
        incomplete: state.incomplete,
      }),
      merge: (persisted, current) => mergeWizardState(persisted as Partial<WizardState> | undefined, current),
    },
  ),
);

export function mergeWizardState(
  data: Partial<WizardState> | undefined,
  current: WizardState,
): WizardState {
  if (!data) {
    return current;
  }

  const restoredSteps: WizardStepsState = {
    ...INITIAL_STEPS_STATE,
    ...(data.steps ?? {}),
  } as WizardStepsState;
  const restoredIncomplete: IncompleteMap = {
    ...INITIAL_INCOMPLETE,
    ...(data.incomplete ?? {}),
  } as IncompleteMap;

  for (const step of WIZARD_STEP_ORDER) {
    const existingStep = restoredSteps[step];
    if (!existingStep) {
      continue;
    }

    const sanitizedStep = {
      ...existingStep,
      status: existingStep.status === 'saving' ? 'editing' : existingStep.status,
    };

    restoredSteps[step] = sanitizedStep;

    if (existingStep.status === 'saving') {
      restoredIncomplete[step] = true;
    }
  }

  return {
    ...current,
    ...data,
    steps: restoredSteps,
    incomplete: restoredIncomplete,
  };
}

export function getStepDefinition(step: WizardStepId): WizardStepDefinition {
  return WIZARD_STEPS.find((entry) => entry.id === step) ?? WIZARD_STEPS[0];
}

export function getInitialDraft<K extends WizardStepId>(step: K): WizardDrafts[K] {
  return cloneDraft(step);
}
