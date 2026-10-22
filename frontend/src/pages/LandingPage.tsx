// src/pages/LandingPage.tsx — Modern cybersecurity landing page for AEGIS Sentinel
import { useState, useId } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Shield,
  ShieldCheck,
  Lock,
  Zap,
  Globe,
  FileCode2,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Activity,
  Terminal,
  Eye,
  Cpu,
  Layers,
  BarChart3,
  LineChart,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sliders,
  Check,
  User,
  LogIn,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { createScan, getErrorMessage } from '../services/api';

// Sample API presets for instant scanning
const SAMPLE_PRESETS = [
  { label: 'GitHub API', url: 'https://api.github.com', badge: 'Production Ready' },
  { label: 'Stripe API', url: 'https://api.stripe.com/v1/charges', badge: 'Strict Auth' },
  { label: 'JSONPlaceholder', url: 'https://jsonplaceholder.typicode.com/posts', badge: 'Public Mock' },
  { label: 'HTTPBin', url: 'https://httpbin.org/get', badge: 'Echo Test' },
];

// Interactive Score Simulator controls
interface SimulatorOption {
  id: string;
  label: string;
  category: string;
  points: number;
  description: string;
}

const SIMULATOR_OPTIONS: SimulatorOption[] = [
  {
    id: 'tls',
    label: 'Enforce TLS 1.3 & AEAD Ciphers',
    category: 'Cryptographic Posture',
    points: 25,
    description: 'Modern forward-secret ciphers with verified SAN certificate chain',
  },
  {
    id: 'headers',
    label: 'Defensive Headers (HSTS, CSP, X-Frame)',
    category: 'Header Posture',
    points: 35,
    description: 'Strict transport security with max-age >= 31536000 and CSP enforcement',
  },
  {
    id: 'leakage',
    label: 'Suppress Server & Framework Banners',
    category: 'Recon Defense',
    points: 20,
    description: 'Stripping Server (nginx/Apache) and X-Powered-By fingerprint headers',
  },
  {
    id: 'reputation',
    label: 'Clean VirusTotal & Safe Browsing Feed',
    category: 'Threat Intel',
    points: 20,
    description: '0 malicious detections across 70+ cybersecurity threat intelligence feeds',
  },
];

// FAQ items
const FAQ_ITEMS = [
  {
    q: 'Is AEGIS safe to run against production APIs?',
    a: 'Yes, 100%. AEGIS uses non-destructive, observable security probes. It never executes intrusive fuzzing payloads, brute-force requests, or state-mutating actions that could corrupt database records or trigger DDoS alarms.',
  },
  {
    q: 'How does AEGIS protect against Server-Side Request Forgery (SSRF)?',
    a: 'Every submitted URL undergoes strict multi-layer resolution validation. Hostnames are resolved to physical IP addresses and checked against private/internal RFC 1918 subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.1, 169.254.0.0/16 cloud metadata IPs, and IPv6 loopbacks) to prevent internal perimeter abuse.',
  },
  {
    q: 'How is the 0–100 Assessment Score calculated?',
    a: 'The assessment score is computed using a deterministic weighted penalty model across 4 pillars: TLS 1.3 (25 max pts), Security Headers (35 max pts), Information Leakage (20 max pts), and Threat Reputation (20 max pts). Unassessed or inconclusive checks are factored into the assessment coverage ratio.',
  },
  {
    q: 'Can I analyze OpenAPI and Swagger specifications?',
    a: 'Yes. AEGIS features a dedicated OpenAPI 3.0 / Swagger parser. You can paste a schema URL or upload a JSON/YAML file to discover all operations, evaluate route parameters, and trigger granular single-endpoint audits.',
  },
  {
    q: 'Can I export executive audit reports for compliance?',
    a: 'Every scan automatically generates an audit-ready, downloadable PDF report built with ReportLab, featuring complete executive summaries, severity distribution matrices, and exact remediation advice.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const scanInputId = useId();

  // Quick scanner state
  const [targetUrl, setTargetUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  // Score simulator state
  const [selectedChecks, setSelectedChecks] = useState<Record<string, boolean>>({
    tls: true,
    headers: true,
    leakage: false,
    reputation: true,
  });

  // Active pillar tab
  const [activePillar, setActivePillar] = useState<'tls' | 'headers' | 'leakage' | 'reputation'>('tls');

  // FAQ accordion state
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Calculate simulated score
  const simulatedScore = SIMULATOR_OPTIONS.reduce((acc, opt) => {
    return acc + (selectedChecks[opt.id] ? opt.points : 0);
  }, 0);

  const getScoreGrade = (score: number) => {
    if (score >= 90) return { grade: 'A+', color: 'text-emerald-400', stroke: '#10b981', label: 'Hardened Perimeter' };
    if (score >= 75) return { grade: 'B', color: 'text-cyan-400', stroke: '#06b6d4', label: 'Satisfactory Posture' };
    if (score >= 55) return { grade: 'C', color: 'text-yellow-400', stroke: '#eab308', label: 'Vulnerabilities Present' };
    return { grade: 'F', color: 'text-red-400', stroke: '#ef4444', label: 'Severe Exposure' };
  };

  const currentGrade = getScoreGrade(simulatedScore);

  const toggleCheck = (id: string) => {
    setSelectedChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Handle instant scan from hero
  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const url = targetUrl.trim();
    if (!url) {
      toast.error('Please enter an API URL to scan.');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast.error('URL must begin with http:// or https://');
      return;
    }

    try {
      setIsScanning(true);
      toast.loading('Initializing SSRF validation & probe dispatch…', { id: 'scan-toast' });
      const scan = await createScan(url, 'Triggered from AEGIS Landing Page');
      toast.success('Scan initiated! Loading telemetry dashboard…', { id: 'scan-toast' });
      navigate(`/scan/${scan.id}`);
    } catch (err) {
      const msg = getErrorMessage(err);
      toast.error(msg, { id: 'scan-toast', duration: 5000 });
      setIsScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
      {/* Background Cyber Grid & Ambient Glows */}
      <div className="absolute inset-0 bg-grid-cyber pointer-events-none opacity-40" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-radial-hero pointer-events-none" />
      <div className="absolute top-[800px] -left-48 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[1600px] -right-48 w-96 h-96 bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* ── 1. Top Navigation Bar ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/75 border-b border-slate-800/80 transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 group-hover:shadow-cyan-400/40 transition-all">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white group-hover:text-cyan-300 transition-colors">
                  AEGIS
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  SENTINEL
                </span>
              </div>
              <span className="text-[11px] text-slate-400 -mt-0.5">Observable API Defense</span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-cyan-400 transition-colors">
              Features
            </a>
            <a href="#security-pillars" className="hover:text-cyan-400 transition-colors">
              Security Matrix
            </a>
            <a href="#score-simulator" className="hover:text-cyan-400 transition-colors">
              Score Simulator
            </a>
            <a href="#visualizers" className="hover:text-cyan-400 transition-colors">
              Visualizer
            </a>
            <a href="#openapi" className="hover:text-cyan-400 transition-colors">
              OpenAPI
            </a>
            <a href="#faq" className="hover:text-cyan-400 transition-colors">
              FAQ
            </a>
          </nav>

          {/* User / Auth CTAs */}
          <div className="flex items-center gap-3">
            {/* Health Beacon */}
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Engines Nominal
            </div>

            {session ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-cyan-500/20 transition-all"
                >
                  <User className="w-3.5 h-3.5" />
                  Console Dashboard
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/auth"
                  className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5 text-slate-400" />
                  Sign In
                </Link>
                <a
                  href="#hero-scanner"
                  className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-cyan-500/20 hover:shadow-cyan-500/35 transition-all"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Launch Scanner
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── 2. Hero Section with Interactive Terminal ──────────────────────── */}
      <section id="hero-scanner" className="relative pt-16 pb-20 md:pt-24 md:pb-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto flex flex-col items-center text-center">
          {/* Eyebrow Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-medium mb-8 backdrop-blur-md shadow-sm shadow-cyan-500/20 animate-float">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>AEGIS Core v1.0 • Non-Destructive API Intelligence</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.12]">
            Observable Security Intelligence
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 bg-clip-text text-transparent text-glow-cyan">
              For Modern APIs.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-slate-400 text-base sm:text-lg lg:text-xl max-w-3xl mb-10 leading-relaxed font-normal">
            Continuously evaluate cryptographic TLS 1.3 health, defensive headers, information leakage,
            and real-time threat intelligence. Deterministic 0–100 evidence-based scoring with{' '}
            <strong className="text-slate-200 font-semibold">zero production disruption</strong>.
          </p>

          {/* Interactive Hero Terminal Box */}
          <div className="w-full max-w-3xl glass-card border border-slate-700/80 rounded-2xl p-4 sm:p-6 shadow-2xl shadow-cyan-950/50 backdrop-blur-2xl relative">
            {/* Terminal Window Header */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 font-mono text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  sentinel-probe --ssrf-strict --target
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-500">
                <span>PORT: 443</span>
                <span>•</span>
                <span>SSRF: ENFORCED</span>
              </div>
            </div>

            {/* URL Input Form */}
            <form onSubmit={handleScanSubmit} className="flex flex-col sm:flex-row items-stretch gap-3 mb-4">
              <div className="relative flex-1 flex items-center bg-slate-900/90 border border-slate-700/70 rounded-xl px-3.5 py-3 focus-within:border-cyan-500/80 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all">
                <Globe className="w-4 h-4 text-slate-500 mr-2.5 flex-shrink-0" />
                <label htmlFor={scanInputId} className="sr-only">Target API Endpoint</label>
                <input
                  id={scanInputId}
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://api.example.com/v1/health"
                  className="w-full bg-transparent text-sm text-white placeholder-slate-500 font-mono focus:outline-none"
                  disabled={isScanning}
                />
                {targetUrl && (
                  <button
                    type="button"
                    onClick={() => setTargetUrl('')}
                    className="text-xs text-slate-500 hover:text-slate-300 ml-2"
                  >
                    Clear
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isScanning || !targetUrl.trim()}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer"
              >
                {isScanning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Auditing Target…</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-cyan-200" />
                    <span>Run Instant Scan</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Sample Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
                <Zap className="w-3 h-3 text-cyan-400" /> Try Sample:
              </span>
              {SAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  onClick={() => setTargetUrl(preset.url)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 hover:text-white transition-all font-mono text-[11px]"
                >
                  <span>{preset.label}</span>
                  <span className="text-[10px] text-cyan-400 bg-cyan-950/80 px-1 py-0.2 rounded border border-cyan-800/40">
                    {preset.badge}
                  </span>
                </button>
              ))}
            </div>

            {/* Terminal Footer Badges */}
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> RFC 1918 Private IP Shield
                </span>
                <span className="flex items-center gap-1 text-cyan-400">
                  <CheckCircle2 className="w-3 h-3" /> 5-Sample Latency Profiler
                </span>
              </div>
              <span className="text-slate-400">Non-Invasive • Zero Exploit Payloads</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Live Metrics Ticker Banner ──────────────────────────────────── */}
      <section className="border-y border-slate-800/70 bg-slate-900/40 backdrop-blur-md py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="p-4 rounded-xl border border-slate-800/50 bg-slate-900/30">
            <div className="text-3xl sm:text-4xl font-extrabold text-transparent bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text">
              0–100
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-300 mt-1">
              Evidence-Based Score
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Deterministic penalty weighting</p>
          </div>

          <div className="p-4 rounded-xl border border-slate-800/50 bg-slate-900/30">
            <div className="text-3xl sm:text-4xl font-extrabold text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text">
              4 Pillars
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-300 mt-1">
              Vector Assessment
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">TLS, Headers, Leaks, Reputation</p>
          </div>

          <div className="p-4 rounded-xl border border-slate-800/50 bg-slate-900/30">
            <div className="text-3xl sm:text-4xl font-extrabold text-transparent bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text">
              &lt; 150ms
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-300 mt-1">
              Avg Probe Latency
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">5-sample jitter & timeout tracking</p>
          </div>

          <div className="p-4 rounded-xl border border-slate-800/50 bg-slate-900/30">
            <div className="text-3xl sm:text-4xl font-extrabold text-transparent bg-gradient-to-r from-cyan-300 to-emerald-400 bg-clip-text">
              100%
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-300 mt-1">
              Production Safe
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Zero crash or corrupt risk</p>
          </div>
        </div>
      </section>

      {/* ── 4. Security Pillars Matrix (The 4 Defense Engines) ──────────────── */}
      <section id="security-pillars" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-3">
            <Layers className="w-3.5 h-3.5" />
            Inspection Architecture
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            The Four Pillars of Observable API Defense
          </h2>
          <p className="text-slate-400 text-sm sm:text-base mt-3">
            Every scan executes deep, non-destructive evaluations across cryptographic, structural,
            leakage, and threat intelligence domains.
          </p>
        </div>

        {/* Pillars Tab Selector */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {[
            { id: 'tls', label: '1. Cryptographic TLS', icon: Lock, maxPts: '25 pts' },
            { id: 'headers', label: '2. Defensive Headers', icon: Shield, maxPts: '35 pts' },
            { id: 'leakage', label: '3. Recon & Information Leakage', icon: Eye, maxPts: '20 pts' },
            { id: 'reputation', label: '4. Threat Intelligence Feed', icon: Activity, maxPts: '20 pts' },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activePillar === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePillar(item.id as typeof activePillar)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500/15 border border-cyan-500/50 text-cyan-300 shadow-md shadow-cyan-500/20'
                    : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span>{item.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {item.maxPts}
                </span>
              </button>
            );
          })}
        </div>

        {/* Pillar Details Card */}
        <div className="glass-card border border-slate-800/80 rounded-2xl p-6 sm:p-8 relative overflow-hidden">
          {activePillar === 'tls' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center fade-in">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold tracking-wider uppercase">
                  <Lock className="w-4 h-4" /> Pillar 01 • Cryptographic Posture
                </div>
                <h3 className="text-2xl font-bold text-white">
                  TLS 1.3 Protocol Negotiation & Cipher Suite Security
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Cryptographic weaknesses expose API traffic to man-in-the-middle (MITM) eavesdropping,
                  protocol downgrades, and certificate forgery. AEGIS probes the TLS handshake to ensure
                  robust forward secrecy and cipher integrity.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">Protocol Level</p>
                    <p className="text-slate-400 mt-1">Verifies TLS 1.3 & TLS 1.2 support; flags deprecated SSLv3, TLS 1.0, 1.1</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">Cipher Verification</p>
                    <p className="text-slate-400 mt-1">Enforces AEAD ciphers (AES-GCM, CHACHA20-POLY1305) with Perfect Forward Secrecy</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">Certificate Expiration</p>
                    <p className="text-slate-400 mt-1">Audits validity window, CA trust chain, and issues warnings within 30 days of expiry</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">SAN Verification</p>
                    <p className="text-slate-400 mt-1">Validates Subject Alternative Names matches the target hostname</p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-5 bg-slate-950/80 rounded-xl p-5 border border-slate-800 font-mono text-xs text-slate-300">
                <div className="text-slate-500 mb-2">// Sample TLS Handshake Telemetry</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between"><span className="text-slate-400">negotiated_version:</span> <span className="text-emerald-400">"TLSv1.3"</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">cipher_suite:</span> <span className="text-cyan-400">"TLS_AES_256_GCM_SHA384"</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">forward_secrecy:</span> <span className="text-emerald-400">true (ECDHE)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">cert_valid_days:</span> <span className="text-emerald-400">184 days</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">issuer:</span> <span className="text-slate-300">"Let's Encrypt R10"</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">hsts_preloaded:</span> <span className="text-emerald-400">true</span></div>
                </div>
              </div>
            </div>
          )}

          {activePillar === 'headers' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center fade-in">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold tracking-wider uppercase">
                  <Shield className="w-4 h-4" /> Pillar 02 • Defensive HTTP Headers
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Modern Defense-in-Depth HTTP Security Policies
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Security headers instruct client browsers and gateway proxies how to handle content,
                  block MIME-sniffing exploits, enforce HTTPS upgrades, and prevent cross-site framing.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">Strict-Transport-Security</p>
                    <p className="text-slate-400 mt-1">Requires max-age &gt;= 31536000 with includeSubDomains</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">Content-Security-Policy</p>
                    <p className="text-slate-400 mt-1">Validates default-src and frame-ancestors restrictions</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">X-Content-Type-Options</p>
                    <p className="text-slate-400 mt-1">Blocks drive-by MIME-confusion attacks via "nosniff"</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">CORS Policy Analysis</p>
                    <p className="text-slate-400 mt-1">Flags dangerous Access-Control-Allow-Origin: * on authenticated endpoints</p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-5 bg-slate-950/80 rounded-xl p-5 border border-slate-800 font-mono text-xs text-slate-300">
                <div className="text-slate-500 mb-2">// Recommended Header Directives</div>
                <div className="space-y-1.5">
                  <div className="text-emerald-400">Strict-Transport-Security: max-age=31536000; includeSubDomains; preload</div>
                  <div className="text-emerald-400">X-Content-Type-Options: nosniff</div>
                  <div className="text-emerald-400">Content-Security-Policy: default-src 'none'; frame-ancestors 'none'</div>
                  <div className="text-emerald-400">X-Frame-Options: DENY</div>
                  <div className="text-emerald-400">Cache-Control: no-store, no-cache</div>
                </div>
              </div>
            </div>
          )}

          {activePillar === 'leakage' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center fade-in">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold tracking-wider uppercase">
                  <Eye className="w-4 h-4" /> Pillar 03 • Information Leakage & Recon
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Suppress Server Banners & Technology Fingerprints
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Attackers rely on automated banner reconnaissance to match specific unpatched CVEs against
                  disclosed web server and framework versions (e.g. Apache/2.4.49, Express, PHP/7.4).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">Server Header Stripping</p>
                    <p className="text-slate-400 mt-1">Flags explicit web server banners disclosing exact software build</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">X-Powered-By Suppression</p>
                    <p className="text-slate-400 mt-1">Flags middleware identifiers (Express, Next.js, PHP, ASP.NET)</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">Stack Trace Inspection</p>
                    <p className="text-slate-400 mt-1">Detects raw Python/Java/Node stack traces in error responses</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">Credential Redaction</p>
                    <p className="text-slate-400 mt-1">Automatically sanitizes API keys and tokens in scan evidence logs</p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-5 bg-slate-950/80 rounded-xl p-5 border border-slate-800 font-mono text-xs">
                <div className="text-slate-500 mb-2">// Information Disclosure Comparison</div>
                <div className="space-y-2">
                  <div className="p-2 rounded bg-red-950/40 border border-red-850/60 text-red-300">
                    <span className="text-red-400 font-semibold">[FAIL] Exposed Banner:</span>
                    <br />
                    Server: Apache/2.4.52 (Ubuntu)
                    <br />
                    X-Powered-By: Express
                  </div>
                  <div className="p-2 rounded bg-emerald-950/40 border border-emerald-850/60 text-emerald-300">
                    <span className="text-emerald-400 font-semibold">[PASS] Hardened Defense:</span>
                    <br />
                    Server: AEGIS-Gateway
                    <br />
                    X-Powered-By: [REDACTED/SUPPRESSED]
                  </div>
                </div>
              </div>
            </div>
          )}

          {activePillar === 'reputation' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center fade-in">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold tracking-wider uppercase">
                  <Activity className="w-4 h-4" /> Pillar 04 • Threat Intelligence Feed
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Global Domain Reputation & Threat Intelligence
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Integrates with VirusTotal and Google Safe Browsing threat feeds to confirm your domain and IP
                  are not blacklisted or compromised by malware, phishing campaigns, or command-and-control (C2) botnets.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">VirusTotal Multi-Engine</p>
                    <p className="text-slate-400 mt-1">Aggregates verdicts across 70+ antivirus and domain security vendors</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">Google Safe Browsing</p>
                    <p className="text-slate-400 mt-1">Checks for active malware, unwanted software, and social engineering flags</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">Autonomous Fallback</p>
                    <p className="text-slate-400 mt-1">Gracefully performs DNS and SSL validation even when API keys are not provided</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <p className="font-semibold text-slate-200">Blacklist Alerting</p>
                    <p className="text-slate-400 mt-1">Instant critical severity alert if reputation engines report malicious activity</p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-5 bg-slate-950/80 rounded-xl p-5 border border-slate-800 font-mono text-xs text-slate-300">
                <div className="text-slate-500 mb-2">// Threat Intelligence Telemetry</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between"><span className="text-slate-400">threat_feed:</span> <span className="text-cyan-400">"VirusTotal v3 API"</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">engines_analyzed:</span> <span className="text-slate-200">74 security engines</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">malicious_verdicts:</span> <span className="text-emerald-400">0</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">suspicious_verdicts:</span> <span className="text-emerald-400">0</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">reputation_grade:</span> <span className="text-emerald-400">"CLEAN"</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">dns_asn:</span> <span className="text-slate-300">"AS13335 CLOUDFLARENET"</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 5. Interactive Live Score Simulator ────────────────────────────── */}
      <section id="score-simulator" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Explanation & Controls */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-semibold">
              <Sliders className="w-3.5 h-3.5" />
              Interactive Playground
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Test the Deterministic Scoring Engine
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Toggle security configurations below to see how our mathematical model computes
              the overall Security Score. No opaque AI guesses — every point is earned through
              verifiable cryptographic and structural proofs.
            </p>

            <div className="space-y-3 pt-2">
              {SIMULATOR_OPTIONS.map((opt) => {
                const isChecked = selectedChecks[opt.id];
                return (
                  <div
                    key={opt.id}
                    onClick={() => toggleCheck(opt.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isChecked
                        ? 'bg-slate-900/90 border-cyan-500/40 shadow-sm shadow-cyan-500/10'
                        : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center mt-0.5 transition-colors ${
                          isChecked ? 'bg-cyan-500 text-slate-950' : 'border border-slate-600 bg-slate-900'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${isChecked ? 'text-white' : 'text-slate-400'}`}>
                            {opt.label}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                            {opt.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg ${
                        isChecked
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      +{opt.points} pts
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Live Simulated Score Meter */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center">
            <div className="glass-card border border-slate-700/80 rounded-2xl p-8 w-full max-w-sm flex flex-col items-center text-center shadow-xl shadow-cyan-950/40">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6">
                Calculated Security Score
              </span>

              {/* Animated Circular Meter */}
              <div className="relative w-48 h-48 flex items-center justify-center mb-6">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#1e293b"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={currentGrade.stroke}
                    strokeWidth="8"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * simulatedScore) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-500 ease-out"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-black text-white tracking-tight">
                    {simulatedScore}
                  </span>
                  <span className={`text-sm font-extrabold uppercase mt-0.5 ${currentGrade.color}`}>
                    Grade {currentGrade.grade}
                  </span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="w-full py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 mb-4">
                <span className={`text-xs font-bold ${currentGrade.color}`}>
                  {currentGrade.label}
                </span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Simulated assessment based on active check matrix. Real scans perform observable live
                probes with millisecond-precision latency statistics.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Visual Intelligence Engine Showcase ─────────────────────────── */}
      <section id="visualizers" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-3">
            <LineChart className="w-3.5 h-3.5" />
            Visual Telemetry
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            High-Resolution Observability & Analytics
          </h2>
          <p className="text-slate-400 text-sm sm:text-base mt-3">
            Understand your API's network behavior at a glance through latency jitter graphs,
            topological request flow diagrams, and severity matrices.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Latency Chart Preview */}
          <div className="glass-card border border-slate-800 rounded-2xl p-6 glow-card-hover flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-4">
                <Activity className="w-5 h-5 text-cyan-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">5-Sample Latency Profiler</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Measures connection latency across 5 isolated probe cycles to detect erratic jitter,
                timeout risks, and cold-start spikes in production gateways.
              </p>
            </div>
            {/* Visual Mini Mockup */}
            <div className="h-28 bg-slate-950/90 rounded-xl p-3 border border-slate-800 flex items-end justify-between gap-2">
              {[45, 62, 50, 110, 55].map((val, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] font-mono text-cyan-400">{val}ms</span>
                  <div
                    style={{ height: `${val * 0.55}%` }}
                    className={`w-full rounded-t transition-all ${
                      val > 100 ? 'bg-yellow-400' : 'bg-cyan-500'
                    }`}
                  />
                  <span className="text-[9px] text-slate-500">#{idx + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Request Flow Graph Preview */}
          <div className="glass-card border border-slate-800 rounded-2xl p-6 glow-card-hover flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4">
                <Cpu className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Topological Flow Diagram</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Interactive React Flow diagram mapping the entire hop path: DNS resolution,
                SSRF IP validation, TLS 1.3 handshake, and HTTP endpoint response.
              </p>
            </div>
            {/* Flow Mockup */}
            <div className="h-28 bg-slate-950/90 rounded-xl p-3 border border-slate-800 flex items-center justify-between text-[10px] font-mono">
              <div className="px-2 py-1.5 rounded bg-slate-800 text-slate-300 border border-slate-700">Probe</div>
              <span className="text-slate-600">→</span>
              <div className="px-2 py-1.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">DNS/IP</div>
              <span className="text-slate-600">→</span>
              <div className="px-2 py-1.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">TLS 1.3</div>
              <span className="text-slate-600">→</span>
              <div className="px-2 py-1.5 rounded bg-slate-800 text-green-400 border border-green-800">200 OK</div>
            </div>
          </div>

          {/* Card 3: Findings Severity Matrix Preview */}
          <div className="glass-card border border-slate-800 rounded-2xl p-6 glow-card-hover flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Findings Severity Matrix</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Categorizes evidence into Critical, High, Medium, Low, and Informational findings
                with instant remediation code snippets for engineering teams.
              </p>
            </div>
            {/* Severity Stack Mockup */}
            <div className="h-28 bg-slate-950/90 rounded-xl p-3 border border-slate-800 flex flex-col justify-center gap-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-emerald-400 font-semibold">Pass: 8 Checks</span>
                <span className="text-slate-500 font-mono">80%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                <div style={{ width: '80%' }} className="bg-emerald-400" />
                <div style={{ width: '15%' }} className="bg-yellow-400" />
                <div style={{ width: '5%' }} className="bg-red-400" />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                <span>0 Critical</span>
                <span>1 Warning</span>
                <span>8 Verified</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. OpenAPI / Swagger Analyzer Spotlight ────────────────────────── */}
      <section id="openapi" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="glass-card border border-slate-800 rounded-3xl p-8 sm:p-12 relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-semibold">
                <FileCode2 className="w-3.5 h-3.5" />
                OpenAPI 3.0 & Swagger Intelligence
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Import Your Entire API Catalog In Seconds
              </h2>
              <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
                Connect your Swagger JSON/YAML files or live URL schemas. AEGIS parses endpoints,
                extracts parameters, and enables 1-click surgical operation scans across individual
                routes with custom authentication headers.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  to="/spec"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs sm:text-sm font-semibold px-5 py-2.5 rounded-xl shadow-md shadow-cyan-500/20 transition-all"
                >
                  <FileCode2 className="w-4 h-4" />
                  Launch Spec Analyzer
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="http://localhost:8000/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-300 text-xs sm:text-sm font-semibold transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Explore Backend OpenAPI Docs
                </a>
              </div>
            </div>

            <div className="lg:col-span-5 bg-slate-950/90 rounded-2xl p-5 border border-slate-800 font-mono text-xs text-slate-300 shadow-inner">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-slate-500">
                <span>openapi.json</span>
                <span className="text-cyan-400">Swagger 3.0</span>
              </div>
              <div className="space-y-1.5">
                <div><span className="text-blue-400">"openapi"</span>: <span className="text-emerald-400">"3.0.3"</span>,</div>
                <div><span className="text-blue-400">"info"</span>: &#123; <span className="text-slate-400">"title": "Payment API", "version": "v2"</span> &#125;,</div>
                <div><span className="text-blue-400">"paths"</span>: &#123;</div>
                <div className="pl-4">
                  <span className="text-purple-400">"/v2/transactions"</span>: &#123;
                  <div className="pl-4 text-emerald-400">"post": &#123; "security": ["bearerAuth"] &#125;,</div>
                  <div className="pl-4 text-cyan-400">"get": &#123; "summary": "List charges" &#125;</div>
                  &#125;
                </div>
                <div>&#125;</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. Comparison Matrix ───────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-3">
            <Cpu className="w-3.5 h-3.5" />
            Comparison Matrix
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Why Teams Choose AEGIS Sentinel
          </h2>
          <p className="text-slate-400 text-sm sm:text-base mt-3">
            Compare modern observable assessment with legacy command-line tools and heavy intrusive scanners.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[650px]">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                <th className="py-4 px-4 font-semibold">Capability</th>
                <th className="py-4 px-4 font-bold text-cyan-400 bg-cyan-950/20 rounded-t-xl">AEGIS Sentinel</th>
                <th className="py-4 px-4 font-semibold">Generic curl -I</th>
                <th className="py-4 px-4 font-semibold">Intrusive DAST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
              <tr>
                <td className="py-3.5 px-4 font-medium text-white">Safe for Live Production APIs</td>
                <td className="py-3.5 px-4 font-bold text-emerald-400 bg-cyan-950/20 flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> 100% Non-Destructive
                </td>
                <td className="py-3.5 px-4 text-slate-400">Yes (Passive)</td>
                <td className="py-3.5 px-4 text-red-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4" /> Risky (Payload injection)
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-medium text-white">SSRF Private IP Filtering</td>
                <td className="py-3.5 px-4 font-bold text-emerald-400 bg-cyan-950/20">
                  <Check className="w-4 h-4 inline mr-1" /> Strict RFC 1918 Guard
                </td>
                <td className="py-3.5 px-4 text-slate-500">None</td>
                <td className="py-3.5 px-4 text-slate-400">Optional</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-medium text-white">Deterministic 0–100 Scoring</td>
                <td className="py-3.5 px-4 font-bold text-emerald-400 bg-cyan-950/20">
                  <Check className="w-4 h-4 inline mr-1" /> Evidence-Weighted
                </td>
                <td className="py-3.5 px-4 text-slate-500">None</td>
                <td className="py-3.5 px-4 text-slate-400">Raw vulnerability counts</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-medium text-white">Latency Jitter Analytics</td>
                <td className="py-3.5 px-4 font-bold text-emerald-400 bg-cyan-950/20">
                  <Check className="w-4 h-4 inline mr-1" /> 5-Sample Telemetry
                </td>
                <td className="py-3.5 px-4 text-slate-500">Single request only</td>
                <td className="py-3.5 px-4 text-slate-500">Heavy overhead</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-medium text-white">OpenAPI 3.0 / Swagger Parser</td>
                <td className="py-3.5 px-4 font-bold text-emerald-400 bg-cyan-950/20">
                  <Check className="w-4 h-4 inline mr-1" /> Built-in 1-Click Operations
                </td>
                <td className="py-3.5 px-4 text-slate-500">None</td>
                <td className="py-3.5 px-4 text-slate-400">Complex setup required</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 font-medium text-white">Executive PDF Report Export</td>
                <td className="py-3.5 px-4 font-bold text-emerald-400 bg-cyan-950/20 rounded-b-xl">
                  <Check className="w-4 h-4 inline mr-1" /> Audit-Ready ReportLab
                </td>
                <td className="py-3.5 px-4 text-slate-500">None</td>
                <td className="py-3.5 px-4 text-slate-400">Paid enterprise tier</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 9. Frequently Asked Questions (Accordion) ──────────────────────── */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-slate-800/80">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Clear Answers
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openFaq === index;
            return (
              <div
                key={index}
                className="glass-card border border-slate-800 rounded-xl overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                  className="w-full py-4 px-5 text-left flex items-center justify-between text-sm sm:text-base font-semibold text-white hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  <span>{item.q}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs sm:text-sm text-slate-400 leading-relaxed border-t border-slate-800/50 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 10. Call To Action Banner ──────────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="glass-card border border-cyan-500/30 bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 rounded-3xl p-8 sm:p-14 text-center relative overflow-hidden shadow-2xl shadow-cyan-950/50">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold">
              <Zap className="w-3.5 h-3.5 text-cyan-400" /> Instant Observability
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Secure Your API Perimeter In 15 Seconds
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Scan any live API URL, detect subtle security misconfigurations, and download compliance-ready
              PDF reports. Zero setup, zero intrusive payloads.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <a
                href="#hero-scanner"
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-lg shadow-cyan-500/30 transition-all cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                Launch Live Scanner
              </a>
              <Link
                to="/dashboard"
                className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 font-semibold text-sm px-6 py-3 rounded-xl transition-all"
              >
                Open Security Console
                <ArrowRight className="w-4 h-4 text-cyan-400" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 11. Futuristic Cyber Footer ────────────────────────────────────── */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">AEGIS Sentinel</p>
              <p className="text-[11px] text-slate-500">Next-Gen Observable API Security Scanner</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400">
            <Link to="/dashboard" className="hover:text-cyan-400 transition-colors">
              Dashboard
            </Link>
            <Link to="/history" className="hover:text-cyan-400 transition-colors">
              Scan History
            </Link>
            <Link to="/spec" className="hover:text-cyan-400 transition-colors">
              Spec Analyzer
            </Link>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="hover:text-cyan-400 transition-colors flex items-center gap-1"
            >
              API Docs <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="text-center md:text-right text-[11px]">
            <p>© {new Date().getFullYear()} AEGIS Sentinel. All rights reserved.</p>
            <p className="text-slate-600 mt-0.5">Non-destructive security evaluation platform</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
