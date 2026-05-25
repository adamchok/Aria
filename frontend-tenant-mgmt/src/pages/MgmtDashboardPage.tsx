import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { ReactNode } from 'react';

// ─── Inline icon components ───────────────────────────────────────────────────

function KeyIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a4 4 0 11-8 0 4 4 0 018 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 11l-7 7v3h3l1-1V19h1v-1h1l1-1" />
    </svg>
  );
}

function WebhookIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v12H4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4-4h8l4 4" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l4-4 4 4 4-8" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// ─── Quick link entries ───────────────────────────────────────────────────────

interface QuickLink {
  to: string;
  label: string;
  desc: string;
  icon: ReactNode;
}

const quickLinks: QuickLink[] = [
  { to: '/keys', label: 'API Keys', desc: 'Manage access tokens', icon: <KeyIcon /> },
  { to: '/webhooks', label: 'Webhooks', desc: 'Configure event hooks', icon: <WebhookIcon /> },
  { to: '/bank-accounts', label: 'Bank Accounts', desc: 'Statements & ledger', icon: <BankIcon /> },
  { to: '/queue', label: 'Queue', desc: 'Buffered transactions', icon: <InboxIcon /> },
  { to: '/analytics', label: 'Analytics', desc: 'AI performance', icon: <ChartIcon /> },
  { to: '/users', label: 'Users', desc: 'Manage team access', icon: <UsersIcon /> },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MgmtDashboardPage() {
  const analyticsQuery = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => api.getAnalytics(),
  });

  const queueQuery = useQuery({
    queryKey: ['queue', 'status'],
    queryFn: () => api.getQueueStatus(),
  });

  const summary = analyticsQuery.data;
  const queue = queueQuery.data;
  const isLoading = analyticsQuery.isLoading || queueQuery.isLoading;
  const isError = analyticsQuery.isError || queueQuery.isError;

  const matchRate = summary ? summary.avg_match_rate : 0;
  const matchRateBorder =
    summary == null
      ? 'border-l-4 border-violet-400'
      : matchRate >= 0.9
      ? 'border-l-4 border-emerald-500'
      : matchRate >= 0.75
      ? 'border-l-4 border-amber-400'
      : 'border-l-4 border-rose-400';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tenant Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Configuration and pipeline overview</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-700" role="alert">Failed to load dashboard metrics.</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => void analyticsQuery.refetch()}>
              Retry analytics
            </Button>
            <Button variant="secondary" onClick={() => void queueQuery.refetch()}>
              Retry queue
            </Button>
          </div>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {/* Completed jobs */}
            <Card className="overflow-hidden">
              <CardContent className="border-l-4 border-violet-400 pt-5">
                <p className="text-xs font-medium uppercase text-slate-500">Completed jobs</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{summary?.total_jobs ?? '—'}</p>
              </CardContent>
            </Card>

            {/* Match rate */}
            <Card className="overflow-hidden">
              <CardContent className={`${matchRateBorder} pt-5`}>
                <p className="text-xs font-medium uppercase text-slate-500">Match rate</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  {summary ? `${Math.round(summary.avg_match_rate * 100)}%` : '—'}
                </p>
              </CardContent>
            </Card>

            {/* Buffered txns */}
            <Card className="overflow-hidden">
              <CardContent className="border-l-4 border-violet-400 pt-5">
                <p className="text-xs font-medium uppercase text-slate-500">Buffered txns</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{queue?.total_buffered ?? '—'}</p>
              </CardContent>
            </Card>

            {/* Batch trigger */}
            <Card className="overflow-hidden">
              <CardContent className="border-l-4 border-amber-400 pt-5">
                <p className="text-xs font-medium uppercase text-slate-500">Batch trigger</p>
                <p className="mt-1 text-lg font-semibold capitalize">{queue?.next_batch_trigger ?? '—'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Match rate progress bar */}
          {summary && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Match rate</span>
                <span>{Math.round(matchRate * 100)}% of {summary.total_records} records matched</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${matchRate * 100}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round(matchRate * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {quickLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:border-violet-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                <span className="mt-0.5 text-violet-500">{link.icon}</span>
                <div>
                  <p className="text-sm font-medium text-slate-900">{link.label}</p>
                  <p className="text-xs text-slate-500">{link.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
