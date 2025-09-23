import { useMemo } from 'react';
import { useHealthStore } from '../store/useHealthStore';

const STATUS_COPY: Record<string, string> = {
  idle: 'Idle',
  loading: 'Checking…',
  ready: 'Healthy',
  error: 'Issue',
};

const STATUS_STYLE: Record<string, string> = {
  idle: 'bg-slate-700 text-slate-100 ring-1 ring-slate-600/60',
  loading: 'bg-brand-500/20 text-brand-200 ring-1 ring-brand-400/60',
  ready: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/50',
  error: 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/60',
};

const StatusBadge = () => {
  const { status, lastUpdated } = useHealthStore((state) => ({
    status: state.status,
    lastUpdated: state.lastUpdated,
  }));

  const formattedTimestamp = useMemo(() => {
    if (!lastUpdated) {
      return 'No recent checks';
    }
    return new Date(lastUpdated).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [lastUpdated]);

  const copy = STATUS_COPY[status] ?? STATUS_COPY.idle;
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.idle;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${style}`}
    >
      <span className="relative inline-flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current"></span>
      </span>
      {copy}
      <span className="text-[10px] font-medium normal-case text-slate-300/80">
        {formattedTimestamp}
      </span>
    </span>
  );
};

export default StatusBadge;
