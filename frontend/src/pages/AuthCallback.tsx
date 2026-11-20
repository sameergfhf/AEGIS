import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Shield, Loader2, XCircle, ArrowLeft } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import BrandLogo from '../components/BrandLogo';
import { ThemeToggle } from '../components/ui';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setToken } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check for token in URL query params (from native Google/GitHub OAuth redirect)
    const token = searchParams.get('token');
    if (token) {
      setToken(token)
        .then(() => {
          navigate('/dashboard', { replace: true });
        })
        .catch((err) => {
          console.error('[AuthCallback] token verification error:', err);
          setError('Failed to verify session token.');
          setTimeout(() => navigate('/auth', { replace: true }), 3000);
        });
      return;
    }

    // 2. Check for error in query params
    const errorMsg = searchParams.get('error') || searchParams.get('error_description');
    if (errorMsg) {
      setError(errorMsg);
      setTimeout(() => navigate('/auth', { replace: true }), 3000);
      return;
    }

    // 3. Fallback: If someone already has a valid token in localStorage
    const existing = localStorage.getItem('aegis_token');
    if (existing) {
      navigate('/dashboard', { replace: true });
      return;
    }

    setError('No authentication token received.');
    setTimeout(() => navigate('/auth', { replace: true }), 2500);
  }, [navigate, searchParams, setToken]);

  return (
    <div className="relative flex min-h-screen flex-col bg-canvas">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="aegis-statusbar">
        <div className="aegis-container aegis-statusbar-inner">
          <span className="flex items-center gap-2">
            <span className="aegis-live-dot" aria-hidden="true" />
            <span className="text-[12px] font-medium text-ink">Completing Authentication</span>
          </span>
          <div className="flex items-center gap-4 text-[12px] text-muted">
            <ThemeToggle />
          </div>
        </div>
      </div>

      <header className="border-b border-line bg-surface py-4">
        <div className="aegis-container flex items-center justify-between">
          <BrandLogo to="/" size="sm" subtitle="Operator console" />
          <Link
            to="/auth"
            className="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to sign in</span>
          </Link>
        </div>
      </header>

      <main
        id="main-content"
        className="aegis-container flex flex-1 items-center justify-center py-12"
      >
        <div className="w-full max-w-[420px] rounded-lg border border-line bg-surface p-8 shadow-sm text-center">
          {error ? (
            <div className="space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                <XCircle size={28} />
              </div>
              <h2 className="text-[18px] font-semibold text-ink">Authentication Failed</h2>
              <p className="text-[13px] text-muted leading-relaxed">{error}</p>
              <p className="text-[12px] text-muted">Redirecting you back to sign in...</p>
              <Link
                to="/auth"
                className="inline-block mt-2 text-[13px] font-medium text-forest hover:underline"
              >
                Return to sign in now
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-forest/10 text-forest">
                <Loader2 size={28} className="animate-spin" />
              </div>
              <h2 className="text-[18px] font-semibold text-ink">Establishing Secure Session</h2>
              <p className="text-[13px] text-muted leading-relaxed">
                Verifying your credentials and preparing your security workspace...
              </p>
              <div className="flex items-center justify-center gap-2 text-[12px] text-muted pt-2">
                <Shield size={14} className="text-forest" />
                <span>Encrypted with AEGIS Auth</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
