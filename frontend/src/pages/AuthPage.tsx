import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, User, ArrowLeft, ShieldCheck, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import BrandLogo from '../components/BrandLogo';
import { ThemeToggle } from '../components/ui';
import toast from 'react-hot-toast';

type AuthMode = 'signin' | 'signup';

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.185 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.111-4.555-4.944 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.748-1.025 2.748-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.337 4.687-4.565 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .268.18.58.688.482C19.138 20.203 22 16.447 22 12.021 22 6.484 17.523 2 12 2z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.49 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

const fieldClass =
  'h-11 w-full rounded-xl border border-line bg-paper px-3.5 text-[13.5px] font-sans text-ink outline-none transition-all duration-150 placeholder:text-muted focus:border-forest focus:ring-2 focus:ring-forest/20';
const iconFieldClass = `${fieldClass} pl-10 pr-4`;
const oauthClass =
  'flex h-11 items-center justify-center gap-2.5 rounded-xl border border-line bg-canvas px-4 text-xs font-semibold text-ink transition-all hover:bg-elevated hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest disabled:cursor-not-allowed disabled:opacity-50';

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const initialMode: AuthMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null);

  const { session, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true });
  }, [session, navigate]);

  function resetState() {
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setLoading(false);
    setInlineError(null);
  }

  function toggleMode() {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    resetState();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setInlineError(null);

    if (mode === 'signup' && !name.trim()) {
      setInlineError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !password) {
      setInlineError('Please fill in all fields.');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setInlineError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setInlineError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(name.trim(), email.trim(), password);
        toast.success('Account created. Welcome to AEGIS.');
        navigate('/dashboard', { replace: true });
      } else {
        await signIn(email.trim(), password);
        toast.success('Welcome back.');
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      let msg = 'Authentication failed. Please verify your credentials.';
      if (axios.isAxiosError(err)) {
        if (err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout')) {
          msg = 'Authentication request timed out. Please check your network or server and try again.';
        } else if (!err.response) {
          msg = 'Unable to reach the authentication service. Please ensure the backend is running.';
        } else if (err.response?.data?.detail) {
          msg = typeof err.response.data.detail === 'string'
            ? err.response.data.detail
            : 'Invalid authentication request.';
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleOAuth(provider: 'google' | 'github') {
    setOauthLoading(provider);
    window.location.href = `/api/auth/oauth/${provider}`;
  }

  const isSignUp = mode === 'signup';

  return (
    <div className="relative min-h-screen bg-canvas text-ink page-auth">
      <div className="grid min-h-screen w-full lg:grid-cols-[1.1fr_1fr]">
        {/* Left Column: Brand Context & Ledger Details (Desktop) */}
        <aside className="relative hidden overflow-hidden border-r border-line bg-elevated/40 p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div
            className="pointer-events-none absolute inset-0 opacity-20 dark:opacity-30 [background-image:radial-gradient(rgba(16,185,129,0.18)_1px,transparent_1px)] [background-size:24px_24px]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-forest/15 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative z-10">
            <BrandLogo to="/" size="md" subtitle="Operator console" />
          </div>

          <div className="relative z-10 my-auto max-w-[32rem] py-10">
            <p className="aegis-eyebrow">Restricted workspace</p>
            <h1 className="mt-3 font-sans text-4xl font-bold leading-[1.1] tracking-[-0.03em] text-ink xl:text-5xl">
              Every scan is a record.
              <br />
              Every record is evidence.
            </h1>
            <p className="mt-4 max-w-[42ch] text-[14.5px] leading-relaxed text-muted">
              Sign in to run probes, keep an auditable history, and coordinate remediation with your team.
            </p>

            <dl className="mt-8 border-t border-line">
              {[
                { n: '01', label: 'Non-destructive probes', detail: 'No fuzzing, no writes, no payloads.' },
                { n: '02', label: 'SSRF-guarded targets', detail: 'Private and reserved ranges rejected.' },
                { n: '03', label: 'Evidence-linked findings', detail: 'Every score traces to an observation.' },
              ].map((item) => (
                <div key={item.n} className="grid grid-cols-[36px_1fr] gap-3 border-b border-line py-3.5">
                  <dt className="font-mono text-[11px] tracking-[0.1em] text-muted">{item.n}</dt>
                  <div>
                    <dt className="text-[13.5px] font-medium text-ink">{item.label}</dt>
                    <dd className="mt-0.5 font-mono text-[11px] leading-relaxed text-muted">{item.detail}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative z-10 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            TLS 1.3 · encrypted at rest · zero payloads
          </div>
        </aside>

        {/* Right Column: Interactive Authentication Form */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-screen w-full flex-col bg-canvas outline-none"
        >
          {/* Header Bar */}
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-line/60 px-6 sm:px-10 lg:justify-end lg:border-b-0">
            <div className="lg:hidden">
              <BrandLogo to="/" size="sm" subtitle="Operator console" />
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="hidden min-h-9 items-center gap-1.5 px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted hover:text-ink sm:inline-flex"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Public site
              </Link>
              <ThemeToggle />
            </div>
          </header>

          {/* Centered Form Container */}
          <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-[440px] rounded-2xl border border-line bg-paper p-6 sm:p-8 shadow-card">
              <p className="aegis-eyebrow">Authentication / operator access</p>
              <h1 className="mt-2 font-sans text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                {isSignUp ? 'Create an operator account.' : 'Sign in to the console.'}
              </h1>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                {isSignUp
                  ? 'One account for scans, history, OpenAPI operations, and team workspaces.'
                  : 'Resume your workspaces, scan history, and posture telemetry.'}
              </p>

              {/* OAuth Buttons Row */}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  id="auth-google-btn"
                  type="button"
                  onClick={() => handleOAuth('google')}
                  disabled={oauthLoading !== null}
                  className={oauthClass}
                >
                  {oauthLoading === 'google' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GoogleIcon />}
                  <span>Google</span>
                </button>
                <button
                  id="auth-github-btn"
                  type="button"
                  onClick={() => handleOAuth('github')}
                  disabled={oauthLoading !== null}
                  className={oauthClass}
                >
                  {oauthLoading === 'github' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GitHubIcon />}
                  <span>GitHub</span>
                </button>
              </div>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-line" />
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">or email credentials</span>
                <div className="h-px flex-1 bg-line" />
              </div>

              {/* Inline Error Notice */}
              {inlineError ? (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-600 dark:text-red-400"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 leading-snug">{inlineError}</span>
                </div>
              ) : null}

              {/* Credential Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp ? (
                  <div>
                    <label htmlFor="auth-name" className="block text-xs font-semibold uppercase tracking-wider text-ink mb-1.5">
                      Full name
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                      <input
                        id="auth-name"
                        type="text"
                        autoComplete="name"
                        placeholder="Alex Morgan"
                        value={name}
                        disabled={loading}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (inlineError) setInlineError(null);
                        }}
                        required
                        className={iconFieldClass}
                      />
                    </div>
                  </div>
                ) : null}

                <div>
                  <label htmlFor="auth-email" className="block text-xs font-semibold uppercase tracking-wider text-ink mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                    <input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@company.com"
                      value={email}
                      disabled={loading}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (inlineError) setInlineError(null);
                      }}
                      required
                      className={iconFieldClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-password" className="block text-xs font-semibold uppercase tracking-wider text-ink mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      placeholder="Minimum 6 characters"
                      value={password}
                      disabled={loading}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (inlineError) setInlineError(null);
                      }}
                      required
                      className={`${iconFieldClass} pr-11`}
                    />
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {isSignUp ? (
                  <div>
                    <label htmlFor="auth-confirm-password" className="block text-xs font-semibold uppercase tracking-wider text-ink mb-1.5">
                      Confirm password
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                      <input
                        id="auth-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Confirm password"
                        value={confirmPassword}
                        disabled={loading}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (inlineError) setInlineError(null);
                        }}
                        required
                        className={`${iconFieldClass} pr-11`}
                      />
                    </div>
                  </div>
                ) : null}

                <button
                  id="auth-password-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="aegis-primary-action mt-2 h-11 w-full rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>{isSignUp ? 'Creating account…' : 'Signing in…'}</span>
                    </>
                  ) : (
                    <>
                      <span>{isSignUp ? 'Create account' : 'Sign in with password'}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 border-t border-line pt-4 text-center text-[13px] text-muted">
                {isSignUp ? 'Already have an account? ' : 'No account yet? '}
                <button
                  id="auth-mode-toggle"
                  type="button"
                  onClick={toggleMode}
                  className="font-semibold text-forest underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-forest"
                >
                  {isSignUp ? 'Sign in instead' : 'Create one'}
                </button>
              </div>

              <p className="mt-4 text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-muted">
                Sessions are issued by native JWT Auth. Credentials never reach the scan engine.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
