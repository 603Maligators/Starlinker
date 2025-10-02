import { ReactNode, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWizardStore, WIZARD_STEP_ORDER } from '../state/wizardStore';

const NAV_LINKS = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/setup', label: 'Setup Wizard', showIncompleteBadge: true },
] as const;

export function ShellLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const wizardIncompleteCount = useWizardStore((state) =>
    WIZARD_STEP_ORDER.reduce((count, step) => (state.incomplete[step] ? count + 1 : count), 0),
  );
  const wizardBadge = useMemo(() => {
    if (wizardIncompleteCount <= 0) {
      return null;
    }
    return (
      <span className="ml-auto inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-rose-500/20 px-2 text-xs font-semibold text-rose-200">
        {wizardIncompleteCount}
      </span>
    );
  }, [wizardIncompleteCount]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="w-full bg-slate-900/60 backdrop-blur lg:w-64">
        <div className="flex h-16 items-center justify-center border-b border-slate-800/80">
          <span className="text-lg font-semibold tracking-wide text-brand-500">Starlinker</span>
        </div>
        <nav className="space-y-1 p-4">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.path);
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-600/20 text-brand-500'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
                }`}
              >
                <span>{link.label}</span>
                {link.showIncompleteBadge ? wizardBadge : null}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 bg-slate-950/70 p-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
