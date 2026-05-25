import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth-store';

interface AuthRouteProps {
  children: ReactNode;
}

export function AuthRoute({ children }: AuthRouteProps) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
