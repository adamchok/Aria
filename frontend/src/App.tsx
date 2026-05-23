import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { JobProgressPage } from '@/pages/JobProgressPage';
import { ResultsPage } from '@/pages/ResultsPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { UploadPage } from '@/pages/UploadPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/upload" replace />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/jobs/:jobId" element={<JobProgressPage />} />
        <Route path="/jobs/:jobId/results" element={<ResultsPage />} />
        <Route path="/jobs/:jobId/review" element={<ReviewPage />} />
        <Route path="*" element={<Navigate to="/upload" replace />} />
      </Routes>
    </AppShell>
  );
}
