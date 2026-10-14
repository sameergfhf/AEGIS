// src/App.tsx — Application router

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ScanResults from './pages/ScanResults';
import ScanHistory from './pages/ScanHistory';
import SpecAnalyzer from './pages/SpecAnalyzer';
import OperationScan from './pages/OperationScan';
import Settings from './pages/Settings';

export default function App() {
  return (
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
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/scan/:scanId" element={<ScanResults />} />
          <Route path="/history" element={<ScanHistory />} />
          <Route path="/spec" element={<SpecAnalyzer />} />
          <Route path="/operation-scan" element={<OperationScan />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

