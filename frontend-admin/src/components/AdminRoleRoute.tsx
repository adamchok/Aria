import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';

export function AdminRoleRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  if (!user) return <Navigate to="/login" replace />;

  if (user.role !== 'admin') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-rose-600">Platform admin access required.</p>
        <button type="button" className="text-sm text-blue-600 underline" onClick={() => clear()}>
          Sign out
        </button>
      </div>
    );
  }

  return children;
}
