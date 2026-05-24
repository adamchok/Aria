import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { ApiKeysPage } from '@/pages/ApiKeysPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { JobProgressPage } from '@/pages/JobProgressPage';
import { JobsPage } from '@/pages/JobsPage';
import { QueuePage } from '@/pages/QueuePage';
import { ResultsPage } from '@/pages/ResultsPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { UploadPage } from '@/pages/UploadPage';
import { WebhooksPage } from '@/pages/WebhooksPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:jobId" element={<JobProgressPage />} />
        <Route path="/jobs/:jobId/results" element={<ResultsPage />} />
        <Route path="/jobs/:jobId/review" element={<ReviewPage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings/keys" element={<ApiKeysPage />} />
        <Route path="/settings/webhooks" element={<WebhooksPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}
