import { NavLink, Outlet } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import { useHealthStore } from '../store/useHealthStore';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
];

const AppLayout = () => {
  const { backendUrl } = useHealthStore((state) => ({
    backendUrl: state.backendUrl,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-50">Starlinker Admin Shell</h1>
            <p className="text-sm text-slate-400">
              React renderer scaffold with live backend health checks.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <StatusBadge />
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Backend: <span className="text-slate-300">{backendUrl ?? 'Unavailable'}</span>
            </p>
          </div>
        </div>
        <nav className="border-t border-slate-800">
          <div className="mx-auto flex w-full max-w-6xl gap-2 px-6 py-3">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
