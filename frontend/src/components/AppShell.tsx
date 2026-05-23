import { type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
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
          <Link to="/upload" className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <img
              src="/aria-logo-full.png"
              alt="ARIA Reconciliation"
              className="h-9 w-auto"
              width={160}
              height={36}
            />
          </Link>
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
