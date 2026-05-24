import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

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
      setError(err.message);
    },
  });

  if (accessToken) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>ARIA Tenant Mgmt — Sign in</CardTitle>
          <p className="text-sm text-slate-500">Tenant configuration workspace</p>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              loginMutation.mutate();
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
