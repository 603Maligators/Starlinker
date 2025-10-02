import { create } from 'zustand';
import { getApiBaseUrl } from '../lib/getApiBaseUrl';
import type { SettingsSchema, StarlinkerConfig, ValidationIssue } from '../types/settings';

type SettingsStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

type SettingsState = {
  config: StarlinkerConfig | null;
  defaults: StarlinkerConfig | null;
  schema: SettingsSchema | null;
  status: SettingsStatus;
  error?: string;
  draft: string;
  validationIssues: ValidationIssue[];
  lastLoaded?: string;
  lastSaved?: string;
  loadSettings: () => Promise<void>;
  setDraft: (draft: string) => void;
  resetDraft: () => void;
  applyDefaultsToDraft: () => void;
  saveDraft: () => Promise<boolean>;
};

function toValidationIssues(payload: unknown): ValidationIssue[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => {
      if (item && typeof item === 'object') {
        const loc = Array.isArray((item as { loc?: unknown }).loc)
          ? ((item as { loc: unknown[] }).loc.map((segment) => String(segment)))
          : [];
        const msg = typeof (item as { msg?: unknown }).msg === 'string'
          ? ((item as { msg: string }).msg)
          : 'Invalid value';
        const type = typeof (item as { type?: unknown }).type === 'string'
          ? ((item as { type: string }).type)
          : undefined;
        return { loc, msg, type } satisfies ValidationIssue;
      }
      return null;
    })
    .filter((entry): entry is ValidationIssue => Boolean(entry));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: null,
  defaults: null,
  schema: null,
  status: 'idle',
  error: undefined,
  draft: '',
  validationIssues: [],
  lastLoaded: undefined,
  lastSaved: undefined,

  loadSettings: async () => {
    const currentStatus = get().status;
    if (currentStatus === 'loading') {
      return;
    }

    const base = getApiBaseUrl();
    set({ status: 'loading', error: undefined });

    try {
      const [configRes, defaultsRes, schemaRes] = await Promise.all([
        fetch(`${base}/settings`),
        fetch(`${base}/settings/defaults`),
        fetch(`${base}/settings/schema`),
      ]);

      if (!configRes.ok) {
        throw new Error(`Failed to load settings (HTTP ${configRes.status})`);
      }
      if (!defaultsRes.ok) {
        throw new Error(`Failed to load defaults (HTTP ${defaultsRes.status})`);
      }
      if (!schemaRes.ok) {
        throw new Error(`Failed to load schema (HTTP ${schemaRes.status})`);
      }

      const [config, defaults, schema] = await Promise.all<[
        StarlinkerConfig,
        StarlinkerConfig,
        SettingsSchema,
      ]>([
        configRes.json(),
        defaultsRes.json(),
        schemaRes.json(),
      ]);

      const now = new Date().toISOString();
      set({
        config,
        defaults,
        schema,
        status: 'ready',
        draft: JSON.stringify(config, null, 2),
        validationIssues: [],
        error: undefined,
        lastLoaded: now,
      });
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unable to load settings',
      });
    }
  },

  setDraft: (draft) => set({ draft }),

  resetDraft: () => {
    const config = get().config;
    if (config) {
      set({
        draft: JSON.stringify(config, null, 2),
        validationIssues: [],
        error: undefined,
      });
    }
  },

  applyDefaultsToDraft: () => {
    const defaults = get().defaults;
    if (defaults) {
      set({
        draft: JSON.stringify(defaults, null, 2),
        validationIssues: [],
        error: undefined,
      });
    }
  },

  saveDraft: async () => {
    const { draft } = get();
    let payload: unknown;
    try {
      payload = JSON.parse(draft);
    } catch (error) {
      set({
        error: error instanceof Error ? `Invalid JSON: ${error.message}` : 'Invalid JSON payload',
        validationIssues: [],
        status: 'ready',
      });
      return false;
    }

    const base = getApiBaseUrl();
    set({ status: 'saving', error: undefined, validationIssues: [] });

    try {
      const response = await fetch(`${base}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => undefined);

      if (response.status === 422) {
        const detail =
          body && typeof body === 'object' && 'detail' in body
            ? (body as { detail: unknown }).detail
            : body;
        const validationIssues = toValidationIssues(detail);
        set({
          status: 'ready',
          error: 'Validation failed. Please review the highlighted issues.',
          validationIssues,
        });
        return false;
      }

      if (!response.ok) {
        throw new Error(`Failed to save settings (HTTP ${response.status})`);
      }

      const updated = body as StarlinkerConfig;
      const now = new Date().toISOString();
      set({
        config: updated,
        draft: JSON.stringify(updated, null, 2),
        status: 'ready',
        validationIssues: [],
        error: undefined,
        lastSaved: now,
      });
      return true;
    } catch (error) {
      set({
        status: 'ready',
        error: error instanceof Error ? error.message : 'Unable to save settings',
      });
      return false;
    }
  },
}));
