type StorageLike = {
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
  readonly length: number;
};

class MemoryStorage implements StorageLike {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

(globalThis as { localStorage?: StorageLike }).localStorage = new MemoryStorage();

const { useWizardStore, mergeWizardState } = await import('../src/state/wizardStore');

const step = 'connections' as const;
const originalSetTimeout = globalThis.setTimeout;

type TimerFunction = typeof setTimeout;

try {
  globalThis.setTimeout = ((() => {
    throw new Error('Simulated timer failure');
  }) as unknown) as TimerFunction;

  await useWizardStore
    .getState()
    .saveStep(step)
    .catch(() => undefined);
} finally {
  globalThis.setTimeout = originalSetTimeout;
}

const failedState = useWizardStore.getState();
if (failedState.steps[step].status !== 'editing') {
  throw new Error('Step did not revert to an editable status after a failed save.');
}
if (!failedState.incomplete[step]) {
  throw new Error('Incomplete flag was not restored after a failed save.');
}

const persisted = {
  ...failedState,
  steps: {
    ...failedState.steps,
    [step]: {
      ...failedState.steps[step],
      status: 'saving',
    },
  },
  incomplete: {
    ...failedState.incomplete,
    [step]: false,
  },
};

const merged = mergeWizardState(persisted, failedState);
if (merged.steps[step].status !== 'editing') {
  throw new Error('Merge did not restore editing status from a persisted saving state.');
}
if (!merged.incomplete[step]) {
  throw new Error('Merge did not reset incomplete flag for a persisted saving state.');
}

console.log('Wizard store reload check passed.');
