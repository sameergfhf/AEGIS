// src/pages/AuthPage.tsx — Sign In / Sign Up page with Password, Email OTP & OAuth

import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Shield,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  KeyRound,
  RotateCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────────────────────────────
type AuthMode = 'signin' | 'signup';
type InputMethod = 'password' | 'email-otp';
type PasswordSignupPhase = 'credentials' | 'otp';
type EmailOtpPhase = 'email' | 'otp';

// ─── GitHub / Google SVG icons ────────────────────────────────────────────────
function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.185 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.111-4.555-4.944 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.748-1.025 2.748-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.337 4.687-4.565 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .268.18.58.688.482C19.138 20.203 22 16.447 22 12.021 22 6.484 17.523 2 12 2z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.49 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [method, setMethod] = useState<InputMethod>('password');

  // Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSignupPhase, setPasswordSignupPhase] = useState<PasswordSignupPhase>('credentials');
  const [signupOtp, setSignupOtp] = useState('');

  // Email OTP state
  const [emailOtpAddress, setEmailOtpAddress] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpPhase, setEmailOtpPhase] = useState<EmailOtpPhase>('email');

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null);

  const { session } = useAuth();
  const navigate = useNavigate();

  // If user already has a session (e.g. after OAuth callback), send them to the app
  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true });
  }, [session, navigate]);

  // ─── Reset ──────────────────────────────────────────────────────────────
  function resetState() {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setPasswordSignupPhase('credentials');
    setSignupOtp('');

    setEmailOtpAddress('');
    setEmailOtpCode('');
    setEmailOtpPhase('email');

    setLoading(false);
    setResending(false);
  }

  function toggleMode() {
    setMode(m => (m === 'signin' ? 'signup' : 'signin'));
    resetState();
  }

  // ─── Password: Submit (Sign In or Sign Up) ───────────────────────────────
  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return toast.error('Please fill in all fields.');
    if (mode === 'signup' && password !== confirmPassword)
      return toast.error('Passwords do not match.');
    if (password.length < 6)
      return toast.error('Password must be at least 6 characters.');

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        // If email confirmation is disabled, user is immediately signed in
        if (data?.session) {
          toast.success('Account created! Welcome to API Sentinel.');
          navigate('/dashboard', { replace: true });
          return;
        }

        // Email confirmation is required — switch to OTP verification step
        setPasswordSignupPhase('otp');
        toast.success('Verification code sent to your email!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success('Welcome back!');
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Password Signup: Verify OTP ─────────────────────────────────────────
  async function handleVerifySignupOtp(e: FormEvent) {
    e.preventDefault();
    if (signupOtp.length < 6) return toast.error('Please enter the 6-digit OTP code.');

    setLoading(true);
    try {
      let res = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: signupOtp.trim(),
        type: 'signup',
      });

      if (res.error) {
        const emailRes = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: signupOtp.trim(),
          type: 'email',
        });
        if (!emailRes.error) {
          res = emailRes;
        }
      }

      if (res.error) throw res.error;

      if (res.data?.session) {
        toast.success('Account verified! Welcome to API Sentinel.');
        navigate('/dashboard', { replace: true });
      } else {
        toast.success('Email confirmed! You can now sign in with your password.');
        setMode('signin');
        setPasswordSignupPhase('credentials');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Invalid OTP code.');
    } finally {
      setLoading(false);
    }
  }

  // Resend signup OTP
  async function handleResendSignupOtp() {
    if (!email) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });
      if (error) throw error;
      toast.success('Verification code resent! Check your inbox.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  }

  // ─── Email OTP: Send ─────────────────────────────────────────────────────
  async function handleSendEmailOtp(e: FormEvent) {
    e.preventDefault();
    if (!emailOtpAddress) return toast.error('Please enter an email address.');

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailOtpAddress.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      setEmailOtpPhase('otp');
      toast.success(`OTP code sent to ${emailOtpAddress.trim()}!`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Email OTP: Verify ───────────────────────────────────────────────────
  async function handleVerifyEmailOtp(e: FormEvent) {
    e.preventDefault();
    if (emailOtpCode.length < 6) return toast.error('Please enter the 6-digit OTP code.');

    setLoading(true);
    try {
      let res = await supabase.auth.verifyOtp({
        email: emailOtpAddress.trim(),
        token: emailOtpCode.trim(),
        type: 'email',
      });

      // If user is new, Supabase sends a signup confirmation token
      if (res.error) {
        const signupRes = await supabase.auth.verifyOtp({
          email: emailOtpAddress.trim(),
          token: emailOtpCode.trim(),
          type: 'signup',
        });
        if (!signupRes.error) {
          res = signupRes;
        }
      }

      if (res.error) throw res.error;

      if (res.data?.session) {
        toast.success('Verified successfully! Welcome.');
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Invalid OTP code.');
    } finally {
      setLoading(false);
    }
  }

  // ─── OAuth ──────────────────────────────────────────────────────────────
  async function handleOAuth(provider: 'google' | 'github') {
    setOauthLoading(provider);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : {},
        },
      });

      if (error) {
        console.error(`[OAuth] ${provider} error:`, error);
        throw error;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `${provider} sign-in failed.`;
      console.error('[OAuth] caught:', msg);
      toast.error(msg, { duration: 6000 });
      setOauthLoading(null);
    }
  }

  const isSignUp = mode === 'signup';

  // ─── Form 1: Password Form ──────────────────────────────────────────────
  function renderPasswordForm() {
    if (isSignUp && passwordSignupPhase === 'otp') {
      return (
        <form onSubmit={handleVerifySignupOtp} className="space-y-4 fade-in">
          <div className="text-center space-y-1 mb-2">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-2">
              <KeyRound className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Enter Verification Code</h3>
            <p className="text-xs text-slate-400">
              We sent a 6-digit confirmation code to{' '}
              <span className="text-cyan-400 font-medium">{email}</span>
            </p>
          </div>

          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              id="auth-signup-otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={signupOtp}
              onChange={e => setSignupOtp(e.target.value.replace(/\D/g, ''))}
              required
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 tracking-widest text-center focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono"
            />
          </div>

          <button
            id="auth-verify-signup-btn"
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-60 shadow-lg shadow-cyan-500/20"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Confirm Account <ArrowRight className="w-4 h-4" /></>}
          </button>

          <div className="flex items-center justify-between text-xs pt-1">
            <button
              type="button"
              onClick={handleResendSignupOtp}
              disabled={resending}
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              Resend code
            </button>
            <button
              type="button"
              onClick={() => { setPasswordSignupPhase('credentials'); setSignupOtp(''); }}
              className="text-slate-400 hover:text-slate-300 transition-colors"
            >
              ← Edit email
            </button>
          </div>
        </form>
      );
    }

    return (
      <form onSubmit={handlePasswordSubmit} className="space-y-4 fade-in">
        {/* Email */}
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all"
          />
        </div>

        {/* Password */}
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            id="auth-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            placeholder="Password (min. 6 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg pl-10 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Confirm password (sign up only) */}
        {isSignUp && (
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              id="auth-confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all"
            />
          </div>
        )}

        <button
          id="auth-password-submit-btn"
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              {isSignUp ? 'Create Account' : 'Sign In with Password'}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    );
  }

  // ─── Form 2: Email OTP Form ─────────────────────────────────────────────
  function renderEmailOtpForm() {
    if (emailOtpPhase === 'otp') {
      return (
        <form onSubmit={handleVerifyEmailOtp} className="space-y-4 fade-in">
          <div className="text-center space-y-1 mb-2">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-2">
              <KeyRound className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Enter Email OTP</h3>
            <p className="text-xs text-slate-400">
              We sent a 6-digit code to{' '}
              <span className="text-cyan-400 font-medium">{emailOtpAddress}</span>
            </p>
          </div>

          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              id="auth-email-otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={emailOtpCode}
              onChange={e => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
              required
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 tracking-widest text-center focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono"
            />
          </div>

          <button
            id="auth-verify-email-otp-btn"
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-60 shadow-lg shadow-cyan-500/20"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify &amp; Sign In <ArrowRight className="w-4 h-4" /></>}
          </button>

          <div className="flex items-center justify-between text-xs pt-1">
            <button
              type="button"
              onClick={handleSendEmailOtp}
              disabled={loading}
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Resend OTP
            </button>
            <button
              type="button"
              onClick={() => { setEmailOtpPhase('email'); setEmailOtpCode(''); }}
              className="text-slate-400 hover:text-slate-300 transition-colors"
            >
              ← Change email
            </button>
          </div>
        </form>
      );
    }

    return (
      <form onSubmit={handleSendEmailOtp} className="space-y-4 fade-in">
        <p className="text-xs text-slate-400 text-center">
          Enter your email and we'll send a 6-digit one-time code to sign in instantly without a password.
        </p>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            id="auth-email-otp-email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email"
            value={emailOtpAddress}
            onChange={e => setEmailOtpAddress(e.target.value)}
            required
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all"
          />
        </div>

        <button
          id="auth-send-email-otp-btn"
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-60 shadow-lg shadow-cyan-500/20"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Send One-Time Code <ArrowRight className="w-4 h-4" /></>}
        </button>
      </form>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-violet-600/4 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(6,182,212,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.4) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="w-full max-w-md relative">
        {/* Back to Home Link */}
        <div className="mb-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors">
            ← Back to Homepage
          </Link>
        </div>

        {/* Header / Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4 shadow-lg shadow-cyan-500/30">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">API Sentinel</h1>
          <p className="text-sm text-slate-400 mt-1">Security Scanner &amp; Behavior Visualizer</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8 glow-cyan">
          {/* Mode heading */}
          <h2 className="text-xl font-semibold text-white mb-1">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            {isSignUp
              ? 'Join API Sentinel to start scanning.'
              : 'Sign in to your API Sentinel account.'}
          </p>

          {/* OAuth buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              id="auth-google-btn"
              onClick={() => handleOAuth('google')}
              disabled={oauthLoading !== null}
              className="flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 hover:border-slate-600/60 text-white text-sm font-medium py-2.5 rounded-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {oauthLoading === 'google' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Google
            </button>
            <button
              id="auth-github-btn"
              onClick={() => handleOAuth('github')}
              disabled={oauthLoading !== null}
              className="flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 hover:border-slate-600/60 text-white text-sm font-medium py-2.5 rounded-lg transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {oauthLoading === 'github' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <GitHubIcon />
              )}
              GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-slate-700/60" />
            <span className="text-xs text-slate-500">or continue with</span>
            <div className="flex-1 h-px bg-slate-700/60" />
          </div>

          {/* Method toggle: Password vs Email OTP */}
          <div className="grid grid-cols-2 bg-slate-800/60 rounded-lg p-1 mb-6 border border-slate-700/40 gap-1">
            <button
              id="auth-method-password"
              type="button"
              onClick={() => { setMethod('password'); resetState(); }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                method === 'password'
                  ? 'bg-slate-700/90 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <Lock className="w-4 h-4 text-cyan-400" />
              Password
            </button>
            <button
              id="auth-method-email-otp"
              type="button"
              onClick={() => { setMethod('email-otp'); resetState(); }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                method === 'email-otp'
                  ? 'bg-slate-700/90 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <Mail className="w-4 h-4 text-cyan-400" />
              Email OTP
            </button>
          </div>

          {/* Form area */}
          {method === 'password' && renderPasswordForm()}
          {method === 'email-otp' && renderEmailOtpForm()}

          {/* Mode switch */}
          {passwordSignupPhase !== 'otp' && emailOtpPhase !== 'otp' && (
            <p className="text-sm text-slate-400 text-center mt-6">
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button
                id="auth-mode-toggle"
                onClick={toggleMode}
                className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-600 mt-6">
          Protected by Supabase Auth · Data encrypted at rest
        </p>
      </div>
    </div>
  );
}
