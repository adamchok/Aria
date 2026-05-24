import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AuthRoute } from '@/components/AuthRoute';
import { DashboardPage } from '@/pages/DashboardPage';
import { JobProgressPage } from '@/pages/JobProgressPage';
import { JobsPage } from '@/pages/JobsPage';
import { LoginPage } from '@/pages/LoginPage';
import { ResultsPage } from '@/pages/ResultsPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { UploadPage } from '@/pages/UploadPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <AuthRoute>
            <AppShell>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/jobs/:jobId" element={<JobProgressPage />} />
                <Route path="/jobs/:jobId/results" element={<ResultsPage />} />
                <Route path="/jobs/:jobId/review" element={<ReviewPage />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppShell>
          </AuthRoute>
        }
      />
    </Routes>
  );
}
