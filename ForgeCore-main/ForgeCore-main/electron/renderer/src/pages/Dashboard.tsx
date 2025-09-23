import { useEffect } from 'react';
import { useHealthStore } from '../store/useHealthStore';

const Dashboard = () => {
  const { status, data, error, backendUrl, fetchHealth } = useHealthStore((state) => ({
    status: state.status,
    data: state.data,
    error: state.error,
    backendUrl: state.backendUrl,
    fetchHealth: state.fetchHealth,
  }));

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-panel">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Backend Health</h2>
            <p className="text-sm text-slate-400">
              Monitoring <span className="font-semibold text-slate-200">{backendUrl ?? '—'}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void fetchHealth()}
              disabled={status === 'loading'}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                status === 'loading'
                  ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                  : 'bg-brand-500 text-white shadow-lg shadow-brand-500/30 hover:bg-brand-400'
              }`}
            >
              {status === 'loading' ? 'Checking…' : 'Refresh'}
            </button>
          </div>
        </div>
        {error ? (
          <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
            {error}
          </p>
        ) : (
          <p className="mt-4 text-sm text-slate-300">
            {status === 'ready'
              ? 'Backend responded successfully. Review the live payload below to confirm scheduler state, storage checks, and configuration merges.'
              : 'Fetching the backend health payload. This will update as soon as the API responds.'}
          </p>
        )}
      </section>
      <section className="flex-1 rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">/health payload</h3>
        <pre className="mt-4 h-full max-h-[480px] overflow-auto rounded-xl border border-slate-800 bg-slate-900/80 p-4 font-mono text-xs text-slate-200">
          {data ? JSON.stringify(data, null, 2) : error ? 'No data available.' : 'Waiting for response…'}
        </pre>
      </section>
    </div>
  );
};

export default Dashboard;
