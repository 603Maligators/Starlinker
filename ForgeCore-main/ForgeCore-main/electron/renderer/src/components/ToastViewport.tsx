import { useEffect } from 'react';
import { useToastStore } from '../state/toastStore';

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    const timers = toasts.map((toast) => {
      const duration = toast.durationMs ?? 4000;
      if (duration <= 0) {
        return undefined;
      }
      const handle = window.setTimeout(() => dismiss(toast.id), duration);
      return () => window.clearTimeout(handle);
    });
    return () => {
      timers.forEach((dispose) => dispose?.());
    };
  }, [toasts, dismiss]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto w-full max-w-sm rounded-lg border px-4 py-3 shadow-lg transition ${
            toast.tone === 'success'
              ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100'
              : toast.tone === 'error'
              ? 'border-rose-500/60 bg-rose-500/15 text-rose-100'
              : 'border-slate-700 bg-slate-900/80 text-slate-100'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description ? (
                <p className="mt-1 text-xs text-slate-300">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded-md border border-transparent px-2 py-1 text-xs font-semibold text-slate-200 transition hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
