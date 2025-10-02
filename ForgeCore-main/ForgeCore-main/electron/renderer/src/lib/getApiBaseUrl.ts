const DEFAULT_BASE = 'http://127.0.0.1:8777';

declare global {
  interface Window {
    __STARLINKER_API_BASE__?: string;
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if (window.__STARLINKER_API_BASE__) {
      return window.__STARLINKER_API_BASE__;
    }
    if (window.location.origin.startsWith('http')) {
      const envBase = import.meta.env.VITE_API_BASE_URL;
      if (envBase) {
        return envBase.replace(/\/$/, '');
      }
    }
  }
  const envBase = import.meta.env.VITE_API_BASE_URL;
  return (envBase ?? DEFAULT_BASE).replace(/\/$/, '');
}
