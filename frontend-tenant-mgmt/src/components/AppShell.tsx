import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/Button';

interface AppShellProps {
  children: ReactNode;
}

interface NavSection {
  label?: string;
  items: { to: string; label: string; icon: ReactNode }[];
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : '')}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function LayoutIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v12H4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4-4h8l4 4" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l4-4 4 4 4-8" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a4 4 0 11-8 0 4 4 0 018 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 11l-7 7v3h3l1-1V19h1v-1h1l1-1" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
    </svg>
  );
}

function WebhookIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

const navSections: NavSection[] = [
  {
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: <LayoutIcon /> },
      { to: '/keys', label: 'API Keys', icon: <KeyIcon /> },
      { to: '/webhooks', label: 'Webhooks', icon: <WebhookIcon /> },
      { to: '/bank-accounts', label: 'Bank Accounts', icon: <BankIcon /> },
      { to: '/queue', label: 'Queue', icon: <InboxIcon /> },
      { to: '/analytics', label: 'Analytics', icon: <ChartIcon /> },
      { to: '/users', label: 'Users', icon: <KeyIcon /> },
    ],
  },
];

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  function handleLogout() {
    clear();
    void navigate('/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200',
          sidebarOpen ? 'w-56' : 'w-14',
        )}
      >
        {/* Logo + toggle */}
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-3">
          {sidebarOpen && (
            <Link
              to="/dashboard"
              className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <img
                src="/aria-logo-full.png"
                alt="ARIA Reconciliation"
                className="h-7 w-auto"
                width={120}
                height={28}
              />
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <ChevronIcon open={false} /> : <MenuIcon />}
          </button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto py-3" aria-label="Primary">
          {navSections.map((section, si) => (
            <div key={si} className={si > 0 ? 'mt-4' : ''}>
              {section.label && sidebarOpen && (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={!sidebarOpen ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )
                  }
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3 space-y-2">
          {sidebarOpen && user && (
            <div className="px-2 text-xs text-slate-500 truncate" title={user.email}>
              {user.email}
            </div>
          )}
          {sidebarOpen && (
            <Button variant="secondary" className="w-full" onClick={handleLogout}>
              Sign out
            </Button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
        <footer className="border-t border-slate-200 bg-white px-6 py-2 text-xs text-slate-500">
          AI Marathon 2026 · Track 3 — Global Treasury Agent
        </footer>
      </div>
    </div>
  );
}
