import { create } from 'zustand';

type BackendHealthState = {
  status: 'unknown' | 'healthy' | 'unreachable' | 'checking';
  lastChecked?: string;
  message?: string;
  latencyMs?: number;
  version?: string;
};

type AppState = {
  backendHealth: BackendHealthState;
  missingPrerequisites: string[];
  setBackendHealth: (health: BackendHealthState) => void;
  updateBackendHealth: (patch: Partial<BackendHealthState>) => void;
  setMissingPrerequisites: (missing: string[]) => void;
};

export const useAppStore = create<AppState>((set) => ({
  backendHealth: { status: 'unknown' },
  missingPrerequisites: [],
  setBackendHealth: (backendHealth) => set({ backendHealth }),
  updateBackendHealth: (patch) =>
    set((state) => ({ backendHealth: { ...state.backendHealth, ...patch } })),
  setMissingPrerequisites: (missing) => set({ missingPrerequisites: [...missing] }),
}));
