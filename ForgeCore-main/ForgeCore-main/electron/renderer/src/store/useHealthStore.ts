import { create } from 'zustand';

type HealthStatus = 'idle' | 'loading' | 'ready' | 'error';

interface HealthPayload {
  [key: string]: unknown;
}

interface HealthStoreState {
  backendUrl: string | null;
  status: HealthStatus;
  data: HealthPayload | null;
  error: string | null;
  lastUpdated: number | null;
  fetchHealth: () => Promise<void>;
}

function resolveBackendUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('backend');
}

const missingBackendMessage =
  'No backend URL was provided to the renderer. Launch Electron via the main process so it can pass the /health endpoint.';

const initialBackendUrl = resolveBackendUrl();

export const useHealthStore = create<HealthStoreState>((set, get) => ({
  backendUrl: initialBackendUrl,
  status: initialBackendUrl ? 'idle' : 'error',
  data: null,
  error: initialBackendUrl ? null : missingBackendMessage,
  lastUpdated: null,
  async fetchHealth() {
    const url = get().backendUrl;
    if (!url) {
      set({ status: 'error', error: missingBackendMessage, data: null });
      return;
    }

    set({ status: 'loading', error: null });
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }
      const payload = (await response.json()) as HealthPayload;
      set({
        status: 'ready',
        data: payload,
        error: null,
        lastUpdated: Date.now(),
      });
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        data: null,
      });
    }
  },
}));
