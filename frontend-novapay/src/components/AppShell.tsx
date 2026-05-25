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

function BriefcaseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4-4 4M12 4v12" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M3 10h18M5 10V7l7-4 7 4v3M9 21v-7h2v7M13 21v-7h2v7" />
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

function ApiIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3-3 3 3M12 6v12M5 19h14" />
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
      { to: '/jobs', label: 'Jobs', icon: <BriefcaseIcon /> },
      { to: '/bank-accounts', label: 'Bank Accounts', icon: <BankIcon /> },
      { to: '/queue', label: 'Queue', icon: <InboxIcon /> },
    ],
  },
  {
    label: 'Integration',
    items: [
      { to: '/ingest', label: 'Simulate ingest', icon: <ApiIcon /> },
    ],
  },
];

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    void navigate('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Dark sidebar — distinguishes this as external client portal */}
      <aside
        className={cn(
          'flex h-screen shrink-0 flex-col border-r border-slate-800 bg-slate-950 transition-all duration-200',
          sidebarOpen ? 'w-56' : 'w-14',
        )}
      >
        {/* Logo + toggle */}
        <div className="flex h-14 items-center justify-between border-b border-slate-800 px-3">
          {sidebarOpen && (
            <Link
              to="/dashboard"
              className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-500 text-xs font-bold text-white">
                N
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-white">NovaPay</span>
                <span className="text-[9px] font-medium uppercase tracking-widest text-teal-400">
                  ARIA API Client
                </span>
              </div>
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
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
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
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
                        ? 'bg-teal-500/10 text-teal-400 border-r-2 border-teal-500'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
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

        {/* Upload CTA + user footer */}
        <div className="border-t border-slate-800 p-3 space-y-2">
          {sidebarOpen && (
            <div className="px-2 text-xs text-slate-600 truncate">
              NovaPay Finance
            </div>
          )}
          <NavLink
            to="/upload"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-teal-600 text-white'
                  : 'bg-teal-500/15 text-teal-400 hover:bg-teal-500/25 hover:text-teal-300',
                !sidebarOpen && 'justify-center',
              )
            }
            title={!sidebarOpen ? 'Upload' : undefined}
          >
            <span className="flex-shrink-0"><UploadIcon /></span>
            {sidebarOpen && <span>Upload</span>}
          </NavLink>
          {sidebarOpen ? (
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <LogOutIcon />
              <span>Sign out</span>
            </button>
          ) : (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="flex w-full items-center justify-center rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <LogOutIcon />
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
        <footer className="border-t border-slate-200 bg-white px-6 py-2 text-xs text-slate-400">
          <span className="font-medium text-slate-600">NovaPay</span>
          {' · '}
          <span>Reference client for ARIA reconciliation API</span>
          {' · '}
          <span>AI Marathon 2026 — Track 3</span>
        </footer>
      </div>
    </div>
  );
}
