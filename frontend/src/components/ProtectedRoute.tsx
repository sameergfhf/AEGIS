// src/components/ProtectedRoute.tsx — Guards routes behind Supabase auth

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Shield } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  /** Optional: wrap outlet in a layout component */
  children?: ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center gap-4">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30">
          <Shield className="w-7 h-7 text-white" />
        </div>
        <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
        <p className="text-sm text-slate-400">Loading API Sentinel…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // If children (e.g. <Layout />) are passed, render them as the layout outlet
  // Otherwise just render <Outlet /> directly
  return children ? <>{children}</> : <Outlet />;
}
