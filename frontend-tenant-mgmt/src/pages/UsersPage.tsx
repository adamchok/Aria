import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { UserResponse } from '@/types/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(email: string): string {
  const parts = (email.split('@')[0] ?? email).split(/[._-]/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Badges ──────────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-violet-50 text-violet-700 ring-violet-200',
  tenant_user: 'bg-slate-100 text-slate-600 ring-slate-200',
};
const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  tenant_user: 'Member',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        ROLE_STYLES[role] ?? 'bg-slate-100 text-slate-600 ring-slate-200'
      }`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        active
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-slate-100 text-slate-500 ring-slate-200'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`}
        aria-hidden="true"
      />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
          <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
      </td>
    </tr>
  );
}

// ─── User row ─────────────────────────────────────────────────────────────────

function UserRow({ user }: { user: UserResponse }) {
  return (
    <tr className="border-t border-slate-100 transition-colors hover:bg-slate-50/60">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700 select-none"
            aria-hidden="true"
          >
            {initials(user.email)}
          </div>
          <span className="text-sm font-medium text-slate-800">{user.email}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <RoleBadge role={user.role} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge active={user.is_active} />
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-slate-500">{formatDate(user.created_at)}</td>
    </tr>
  );
}

// ─── Invite modal ─────────────────────────────────────────────────────────────

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
}

function InviteModal({ open, onClose }: InviteModalProps) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  const createMutation = useMutation({
    mutationFn: () => api.createTenantUser(email.trim(), password),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant', 'users'] });
      handleClose();
    },
  });

  function handleClose() {
    setEmail('');
    setPassword('');
    onClose();
  }

  useEffect(() => {
    if (open) {
      createMutation.reset();
      setTimeout(() => emailRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSubmit = email.trim().length >= 3 && password.length >= 8;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="invite-modal-title" className="text-base font-semibold text-slate-900">
              Invite team member
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              They will be able to sign in immediately with this password.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="ml-4 flex-shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form
          className="flex flex-col gap-4 px-6 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) createMutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="modal-invite-email" className="text-sm font-medium text-slate-700">
              Email address
            </label>
            <input
              id="modal-invite-email"
              ref={emailRef}
              type="email"
              required
              autoComplete="off"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="modal-invite-password" className="text-sm font-medium text-slate-700">
              Temporary password
            </label>
            <input
              id="modal-invite-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <p className="text-xs text-slate-500">Ask the user to change this on first sign-in.</p>
          </div>

          {createMutation.isError && (
            <div
              className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5"
              role="alert"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-rose-700">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : 'Could not create user. The email may already be registered.'}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-2">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || createMutation.isPending}
              loading={createMutation.isPending}
            >
              Create user
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${className ?? 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function UsersPage() {
  const [showInvite, setShowInvite] = useState(false);

  const usersQuery = useQuery({
    queryKey: ['tenant', 'users'],
    queryFn: () => api.listTenantUsers(),
  });

  const users = usersQuery.data ?? [];
  const activeCount = users.filter((u) => u.is_active).length;
  const showStats = !usersQuery.isLoading && users.length > 0;

  return (
    <>
      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} />

      <div className="flex flex-col gap-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage team members who can access this account
            </p>
          </div>
          <Button onClick={() => setShowInvite(true)}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
            </svg>
            Invite user
          </Button>
        </div>

        {/* Stats */}
        {showStats && (
          <div className="grid grid-cols-2 gap-4 sm:max-w-xs">
            <StatCard label="Total members" value={users.length} />
            <StatCard label="Active" value={activeCount} className="text-emerald-600" />
          </div>
        )}

        {/* Team members table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle>Team members</CardTitle>
            {!usersQuery.isLoading && users.length > 0 && (
              <span className="text-xs text-slate-500">
                {users.length} {users.length === 1 ? 'user' : 'users'}
              </span>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {usersQuery.isError && (
              <div className="p-4">
                <p className="text-sm text-rose-600" role="alert">
                  Failed to load users.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => void usersQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            )}

            {!usersQuery.isError && (
              <table className="w-full text-left text-sm" aria-label="Team members">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                      User
                    </th>
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Role
                    </th>
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usersQuery.isLoading && (
                    <>
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                    </>
                  )}
                  {!usersQuery.isLoading && users.map((u) => (
                    <UserRow key={u.id} user={u} />
                  ))}
                </tbody>
              </table>
            )}

            {!usersQuery.isLoading && !usersQuery.isError && users.length === 0 && (
              <EmptyState
                title="No team members yet"
                description="Invite a colleague so they can sign in to the reconciliation ops app."
                action={
                  <Button size="sm" onClick={() => setShowInvite(true)}>
                    Invite first user
                  </Button>
                }
                className="m-4 border-dashed"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
