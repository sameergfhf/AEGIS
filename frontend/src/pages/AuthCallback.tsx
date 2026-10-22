// src/pages/AuthCallback.tsx — Handles Supabase OAuth redirect & PKCE code exchange

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Shield, Loader2, XCircle } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase automatically exchanges the code for a session when getSession() is called
    // on a page that has ?code= in the URL (PKCE flow)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[AuthCallback] session error:', error);
        setError(error.message);
        setTimeout(() => navigate('/auth', { replace: true }), 3000);
        return;
      }

      if (session) {
        console.log('[AuthCallback] session established, redirecting to dashboard');
        navigate('/dashboard', { replace: true });
      } else {
        // Also listen for the auth state change event (SIGNED_IN fires after code exchange)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          console.log('[AuthCallback] auth event:', event, !!session);
          if (event === 'SIGNED_IN' && session) {
            subscription.unsubscribe();
            navigate('/dashboard', { replace: true });
          } else if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
            subscription.unsubscribe();
            navigate('/auth', { replace: true });
          }
        });

        // Fallback — if nothing happens in 8s, go back to auth
        const timeout = setTimeout(() => {
          subscription.unsubscribe();
          setError('Authentication timed out. Please try again.');
          setTimeout(() => navigate('/auth', { replace: true }), 2000);
        }, 8000);

        return () => {
          subscription.unsubscribe();
          clearTimeout(timeout);
        };
      }
    });
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <XCircle className="w-7 h-7 text-red-400" />
        </div>
        <p className="text-red-400 text-sm font-medium">{error}</p>
        <p className="text-slate-500 text-xs">Redirecting back to sign in…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center gap-4">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30">
        <Shield className="w-7 h-7 text-white" />
      </div>
      <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
      <p className="text-sm text-slate-400">Completing sign in…</p>
    </div>
  );
}
