import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth-store';

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

const FEATURES = [
  'Multimodal payment proof extraction',
  'AI-powered cross-border reconciliation',
  'FX variance tolerance matching',
  'Audit trail for every decision',
];

export function LoginPage() {
  const { accessToken, setAuth } = useAuthStore();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.detail && typeof err.detail === 'object' && 'detail' in err.detail) {
        setError(String((err.detail as { detail: string }).detail));
      } else {
        setError(err.message || 'Sign in failed. Check your credentials and try again.');
      }
    },
  });

  if (accessToken) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[480px] lg:shrink-0 flex-col justify-between bg-slate-950 px-12 py-12">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500 text-sm font-bold text-white">
            A
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-semibold text-white">ARIA Portal</span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-teal-400">
              Client Workspace
            </span>
          </div>
        </div>

        {/* Value prop */}
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold leading-snug text-white">
              Reconcile cross-border payments with AI confidence.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Upload payment proofs and bank statements. ARIA extracts, normalises, and matches
              transactions across corridors — flagging only what needs your attention.
            </p>
          </div>

          <ul className="space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <CheckIcon />
                <span className="text-sm text-slate-300">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="text-xs text-slate-700">
          ARIA · AI Marathon 2026 — Track 3: Global Treasury Agent
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-sm font-bold text-white">
              A
            </span>
            <span className="text-base font-semibold text-slate-900">ARIA Portal</span>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Finance officer reconciliation workspace</p>
          </div>

          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              loginMutation.mutate();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Email address</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </label>

            {error && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="mt-1 flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-teal-300"
            >
              {loginMutation.isPending && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
              )}
              {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            Access managed by your organisation administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
