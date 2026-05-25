import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/Button';

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-violet-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

const features = [
  'API key management',
  'Webhook configuration',
  'Bank account setup',
  'AI performance analytics',
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
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[440px] lg:shrink-0 flex-col justify-between bg-violet-700 px-12 py-12">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/20 text-sm font-bold text-violet-100">
            A
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-semibold text-white">ARIA Mgmt</span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-violet-200">Tenant Console</span>
          </span>
        </div>

        {/* Center content */}
        <div className="flex flex-col gap-6">
          <h1 className="text-3xl font-bold leading-snug text-white">
            Configure your tenant's reconciliation settings.
          </h1>
          <p className="text-sm text-violet-200 leading-relaxed">
            Manage API credentials, webhooks, bank account integrations, and monitor AI reconciliation performance — all from one place.
          </p>
          <ul className="flex flex-col gap-3">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <CheckIcon />
                <span className="text-sm text-violet-100">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="text-xs text-violet-400">
          AI Marathon 2026 · Track 3 — Global Treasury Agent
        </p>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-xs font-bold text-white">
              A
            </span>
            <span className="text-sm font-semibold text-slate-900">ARIA Mgmt</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Tenant configuration workspace</p>
          </div>

          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              loginMutation.mutate();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
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
                className="rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </label>
            {error && (
              <p className="text-sm text-rose-600" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={loginMutation.isPending} className="w-full">
              {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-8 text-xs text-slate-400">
            Access is restricted to authorised tenant administrators. Contact your platform admin if you need an account.
          </p>
        </div>
      </div>
    </div>
  );
}
