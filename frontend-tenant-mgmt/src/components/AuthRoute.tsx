import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth-store';

interface AuthRouteProps {
  children: ReactNode;
}

export function AuthRoute({ children }: AuthRouteProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const clear = useAuthStore((s) => s.clear);
  const location = useLocation();

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.me(),
    enabled: Boolean(accessToken),
    retry: false,
  });

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (meQuery.isLoading) {
    return <p className="p-6 text-sm text-slate-500">Verifying session…</p>;
  }

  if (meQuery.isError) {
    clear();
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
