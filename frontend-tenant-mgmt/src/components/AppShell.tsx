import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth-store';

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

function UsersNavIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function BrainNavIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.575 1.575A3.75 3.75 0 0115.75 18h-7.5a3.75 3.75 0 01-2.475-.925L4.2 15m15.6 0H4.2m0 0L3 16.2" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
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
      { to: '/users', label: 'Users', icon: <UsersNavIcon /> },
      { to: '/vendor-rules', label: 'AI Feedback', icon: <BrainNavIcon /> },
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
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200',
          sidebarOpen ? 'w-56' : 'w-14',
        )}
      >
        {/* Logo + toggle */}
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-3">
          {sidebarOpen && (
            <Link
              to="/dashboard"
              className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-xs font-bold text-white">
                A
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-sm font-semibold text-slate-900">My Account</span>
                <span className="text-[9px] font-medium uppercase tracking-widest text-violet-500">Settings</span>
              </span>
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <ChevronIcon open={false} /> : <MenuIcon />}
          </button>
        </div>

        {/* Nav sections */}
        <nav className="sidebar-scroll flex-1 overflow-y-auto py-3" aria-label="Primary">
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
                        ? 'border-l-2 border-violet-600 bg-violet-50 text-violet-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
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

        <div className="border-t border-slate-200 p-3 space-y-1">
          {sidebarOpen && user && (
            <div className="px-2 text-xs text-slate-500 truncate" title={user.email}>
              {user.email}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            title={!sidebarOpen ? 'Sign out' : undefined}
            aria-label="Sign out"
          >
            <LogOutIcon />
            {sidebarOpen && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
        <footer className="border-t border-slate-200 bg-white px-6 py-2 text-xs text-slate-500">
          ARIA Reconciliation · My Account · AI Marathon 2026 — Track 3
        </footer>
      </div>
    </div>
  );
}
