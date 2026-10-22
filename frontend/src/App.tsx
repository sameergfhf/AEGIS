// src/App.tsx — Application router with auth protection

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import ScanResults from './pages/ScanResults';
import ScanHistory from './pages/ScanHistory';
import SpecAnalyzer from './pages/SpecAnalyzer';
import OperationScan from './pages/OperationScan';
import Settings from './pages/Settings';

function ScanRoute() {
  const { session } = useAuth();
  return session ? (
    <Layout>
      <ScanResults />
    </Layout>
  ) : (
    <ScanResults />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid rgba(71,85,105,0.5)',
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#0f172a' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#0f172a' } },
          }}
        />
        <Routes>
          {/* Public Landing & Auth routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Scan Results viewable by both guests and authenticated users */}
          <Route path="/scan/:scanId" element={<ScanRoute />} />

          {/* Protected routes */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/history" element={<ScanHistory />} />
            <Route path="/spec" element={<SpecAnalyzer />} />
            <Route path="/operation-scan" element={<OperationScan />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
