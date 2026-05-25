import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { TenantResponse, UserResponse } from '@/types/api';

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg className="h-10 w-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Onboarding wizard modal ──────────────────────────────────────────────────

type WizardStep = 'details' | 'user' | 'done';

interface WizardState {
  tenant: TenantResponse | null;
  user: UserResponse | null;
}

function OnboardModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<WizardStep>('details');
  const [result, setResult] = useState<WizardState>({ tenant: null, user: null });

  // Step 1 fields
  const [tenantName, setTenantName] = useState('');

  // Step 2 fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const createTenantMutation = useMutation({
    mutationFn: () => api.createTenant(tenantName.trim()),
    onSuccess: (tenant) => {
      setResult((r) => ({ ...r, tenant }));
      void qc.invalidateQueries({ queryKey: ['tenants'] });
      setStep('user');
    },
  });

  const createUserMutation = useMutation({
    mutationFn: () =>
      api.createUser({
        email: email.trim(),
        password,
        role: 'tenant_user',
        tenant_id: result.tenant!.id,
      }),
    onSuccess: (user) => {
      setResult((r) => ({ ...r, user }));
      void qc.invalidateQueries({ queryKey: ['users'] });
      setStep('done');
    },
  });

  function handleSkipUser() {
    setStep('done');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboard-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Progress bar */}
        <div className="flex h-1 w-full overflow-hidden rounded-t-xl bg-slate-100">
          <div
            className="bg-violet-600 transition-all duration-500"
            style={{ width: step === 'details' ? '33%' : step === 'user' ? '66%' : '100%' }}
          />
        </div>

        <div className="p-6">
          {/* Step indicator */}
          <div className="mb-5 flex items-center gap-2 text-xs text-slate-500">
            {(['details', 'user', 'done'] as WizardStep[]).map((s, i) => (
              <span key={s} className={`flex items-center gap-1 ${step === s ? 'font-semibold text-violet-700' : ''}`}>
                {i > 0 && <span className="mx-1 text-slate-300">/</span>}
                {i + 1}. {s === 'details' ? 'Tenant' : s === 'user' ? 'First user' : 'Done'}
              </span>
            ))}
          </div>

          {/* ── Step 1: Tenant details ── */}
          {step === 'details' && (
            <>
              <h2 id="onboard-title" className="text-lg font-semibold text-slate-900">Create new tenant</h2>
              <p className="mt-1 text-sm text-slate-500">Enter the organisation name to provision a new tenant account.</p>

              <form
                className="mt-5 flex flex-col gap-4"
                onSubmit={(e) => { e.preventDefault(); if (tenantName.trim()) createTenantMutation.mutate(); }}
              >
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Organisation name</span>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g. Acme Corp Sdn Bhd"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                </label>

                {createTenantMutation.isError && (
                  <p className="text-sm text-rose-600" role="alert">Failed to create tenant. Name may already be taken.</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                  <Button type="submit" disabled={!tenantName.trim()} loading={createTenantMutation.isPending}>
                    Create tenant →
                  </Button>
                </div>
              </form>
            </>
          )}

          {/* ── Step 2: First user ── */}
          {step === 'user' && result.tenant && (
            <>
              <h2 id="onboard-title" className="text-lg font-semibold text-slate-900">Add first user</h2>
              <div className="mt-1 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                  {result.tenant.name.charAt(0).toUpperCase()}
                </span>
                <p className="text-sm text-slate-500">
                  Create a login for <span className="font-medium text-slate-700">{result.tenant.name}</span>
                </p>
              </div>

              <form
                className="mt-5 flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email.trim() && password.length >= 8) createUserMutation.mutate();
                }}
              >
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Email address</span>
                  <input
                    autoFocus
                    type="email"
                    required
                    autoComplete="off"
                    placeholder="finance@acme.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Password</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                  <span className="text-xs text-slate-400">Minimum 8 characters</span>
                </label>

                {createUserMutation.isError && (
                  <p className="text-sm text-rose-600" role="alert">Failed to create user. Email may already be registered.</p>
                )}

                <div className="flex justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSkipUser}
                    className="text-sm text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
                  >
                    Skip for now
                  </button>
                  <div className="flex gap-2">
                    <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                    <Button
                      type="submit"
                      disabled={!email.trim() || password.length < 8}
                      loading={createUserMutation.isPending}
                    >
                      Add user →
                    </Button>
                  </div>
                </div>
              </form>
            </>
          )}

          {/* ── Step 3: Done ── */}
          {step === 'done' && result.tenant && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircleIcon />
              <div>
                <h2 id="onboard-title" className="text-lg font-semibold text-slate-900">Tenant onboarded</h2>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-medium text-slate-700">{result.tenant.name}</span> is ready to use.
                </p>
              </div>

              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-4 text-left">
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Tenant ID</dt>
                    <dd className="font-mono text-xs text-slate-700 select-all">{result.tenant.id}</dd>
                  </div>
                  {result.user && (
                    <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2">
                      <dt className="text-slate-500">User created</dt>
                      <dd className="text-slate-700">{result.user.email}</dd>
                    </div>
                  )}
                  {!result.user && (
                    <div className="border-t border-slate-200 pt-2">
                      <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                        No user created — add one from the tenant detail page.
                      </p>
                    </div>
                  )}
                </dl>
              </div>

              <div className="flex w-full gap-2">
                <Button variant="secondary" className="flex-1" onClick={onClose}>Close</Button>
                <Link
                  to={`/tenants/${result.tenant.id}`}
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 transition-colors"
                >
                  View tenant
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TenantsPage() {
  const [showWizard, setShowWizard] = useState(false);

  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.listTenants(),
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tenants</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage platform tenants
            {tenantsQuery.data && (
              <span className="ml-2 inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                {tenantsQuery.data.length} total
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setShowWizard(true)}>
          <span className="flex items-center gap-1.5"><PlusIcon /> Onboard tenant</span>
        </Button>
      </div>

      {/* Tenants list */}
      <Card>
        <CardHeader><CardTitle>All tenants</CardTitle></CardHeader>
        <CardContent className="p-0">
          {tenantsQuery.isLoading && (
            <div className="space-y-3 p-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          )}
          {tenantsQuery.isError && (
            <div className="p-4">
              <p className="text-sm text-rose-600" role="alert">Failed to load tenants.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void tenantsQuery.refetch()}>Retry</Button>
            </div>
          )}
          {tenantsQuery.data?.length === 0 && (
            <EmptyState
              title="No tenants yet"
              description="Click 'Onboard tenant' to provision your first finance team."
              action={<Button onClick={() => setShowWizard(true)}><span className="flex items-center gap-1.5"><PlusIcon /> Onboard tenant</span></Button>}
              className="m-4 border-0"
            />
          )}
          {tenantsQuery.data && tenantsQuery.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Organisation</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Tenant ID</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tenantsQuery.data.map((t: TenantResponse) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700" aria-hidden="true">
                            {t.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="font-medium text-slate-900">{t.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-slate-500 select-all">{t.id}</span>
                      </td>
                      <td className="px-5 py-4 text-slate-500">{formatDate(t.created_at)}</td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          to={`/tenants/${t.id}`}
                          className="rounded text-sm font-medium text-violet-600 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                        >
                          Manage →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showWizard && <OnboardModal onClose={() => setShowWizard(false)} />}
    </div>
  );
}
