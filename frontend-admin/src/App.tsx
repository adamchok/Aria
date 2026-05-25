import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoleRoute } from '@/components/AdminRoleRoute';
import { AppShell } from '@/components/AppShell';
import { AuthRoute } from '@/components/AuthRoute';
import { AdminAnalyticsPage } from '@/pages/AdminAnalyticsPage';
import { LoginPage } from '@/pages/LoginPage';
import { TenantDetailPage } from '@/pages/TenantDetailPage';
import { TenantsPage } from '@/pages/TenantsPage';
import { UsersPage } from '@/pages/UsersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <AuthRoute>
            <AdminRoleRoute>
              <AppShell>
                <Routes>
                  <Route path="/" element={<Navigate to="/tenants" replace />} />
                  <Route path="/tenants" element={<TenantsPage />} />
                  <Route path="/tenants/:tenantId" element={<TenantDetailPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/analytics" element={<AdminAnalyticsPage />} />
                  <Route path="*" element={<Navigate to="/tenants" replace />} />
                </Routes>
              </AppShell>
            </AdminRoleRoute>
          </AuthRoute>
        }
      />
    </Routes>
  );
}
