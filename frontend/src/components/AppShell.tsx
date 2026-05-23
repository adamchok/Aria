import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

interface AppShellProps {
  children: ReactNode;
}

const navItems = [
  { to: '/upload', label: 'Upload' },
];

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-slate-900 text-sm font-bold text-white">
              A
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">ARIA</p>
              <p className="text-xs text-slate-500">Autonomous Reconciliation Intelligence Agent</p>
            </div>
          </div>
          <nav aria-label="Primary" className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded px-3 py-1.5 text-sm font-medium',
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-7xl px-6 py-3 text-xs text-slate-500">
          AI Marathon 2026 · Track 3 — Global Treasury Agent
        </div>
      </footer>
    </div>
  );
}
