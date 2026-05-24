import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

export function AdminRoleRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  if (!user) return <Navigate to="/login" replace />;

  if (user.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            <p className="text-sm text-rose-600" role="alert">
              Platform admin access required. Sign in with an admin account to use this console.
            </p>
            <Button variant="secondary" onClick={() => clear()}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return children;
}
