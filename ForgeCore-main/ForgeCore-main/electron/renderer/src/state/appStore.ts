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
  setBackendHealth: (health: BackendHealthState) => void;
  updateBackendHealth: (patch: Partial<BackendHealthState>) => void;
};

export const useAppStore = create<AppState>((set) => ({
  backendHealth: { status: 'unknown' },
  setBackendHealth: (backendHealth) => set({ backendHealth }),
  updateBackendHealth: (patch) =>
    set((state) => ({ backendHealth: { ...state.backendHealth, ...patch } })),
}));
