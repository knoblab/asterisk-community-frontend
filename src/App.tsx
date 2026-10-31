import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MaintenanceGuard } from './components/MaintenanceGuard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ToastContainer';
import { useUIStore } from './stores/useUIStore';
import { useAuthStore } from './stores/useAuthStore';

import { ServerStatusNotice } from './components/common/ServerStatusNotice';
import { useSlowLoading } from './hooks/useSlowLoading';

const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const ImageViewerPage = React.lazy(() => import('./pages/ImageViewerPage').then(m => ({ default: m.ImageViewerPage })));

const LoadingScreen = () => {
  const isSlow = useSlowLoading(true, 3500);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', gap: '16px', padding: '16px' }}>
      <div style={{ color: 'var(--color-functional-red)', fontWeight: 'bold', fontFamily: 'var(--font-sans)' }}>로딩 중...</div>
      {isSlow && (
        <ServerStatusNotice
          compact
          message="로딩이 되지 않나요?"
        />
      )}
    </div>
  );
};

function App() {
  const theme = useUIStore((state) => state.theme);
  const initAuth = useAuthStore((state) => state.initAuth);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ErrorBoundary>
      <MaintenanceGuard>
        <ToastContainer />
        <BrowserRouter>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/image/:filename" element={<ImageViewerPage />} />
              <Route path="/*" element={<Dashboard />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </MaintenanceGuard>
    </ErrorBoundary>
  );
}

export default App;
