import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AuthRoute } from '@/components/AuthRoute';
import { TenantRoleRoute } from '@/components/TenantRoleRoute';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { ApiKeysPage } from '@/pages/ApiKeysPage';
import { BankAccountDetailPage } from '@/pages/BankAccountDetailPage';
import { BankAccountsPage } from '@/pages/BankAccountsPage';
import { LoginPage } from '@/pages/LoginPage';
import { MgmtDashboardPage } from '@/pages/MgmtDashboardPage';
import { QueuePage } from '@/pages/QueuePage';
import { UsersPage } from '@/pages/UsersPage';
import { VendorRulesPage } from '@/pages/VendorRulesPage';
import { WebhooksPage } from '@/pages/WebhooksPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <AuthRoute>
            <TenantRoleRoute>
              <AppShell>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<MgmtDashboardPage />} />
                  <Route path="/keys" element={<ApiKeysPage />} />
                  <Route path="/webhooks" element={<WebhooksPage />} />
                  <Route path="/bank-accounts" element={<BankAccountsPage />} />
                  <Route path="/bank-accounts/:accountId" element={<BankAccountDetailPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/queue" element={<QueuePage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/vendor-rules" element={<VendorRulesPage />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </AppShell>
            </TenantRoleRoute>
          </AuthRoute>
        }
      />
    </Routes>
  );
}
