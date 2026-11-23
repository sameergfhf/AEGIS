import { useState, useId } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Globe,
  Lock,
  Menu,
  Shield,
  X,
  Terminal,
  Activity,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { createScan, getErrorMessage } from '../services/api';
import BrandLogo from '../components/BrandLogo';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { Badge } from '../components/ui';
import AegisSentinelMascot, { type MascotPrompt } from '../components/AegisSentinelMascot';
import ConnectedNeuronsCanvas from '../components/ConnectedNeuronsCanvas';

const SAMPLE_PRESETS = [
  { label: 'GitHub', url: 'https://api.github.com' },
  { label: 'Stripe', url: 'https://api.stripe.com/v1/charges' },
  { label: 'JSONPlaceholder', url: 'https://jsonplaceholder.typicode.com/posts' },
  { label: 'HTTPBin', url: 'https://httpbin.org/get' },
];

const CURRENT_YEAR = new Date().getFullYear();

const ESTIMATOR_OPTIONS = [
  { id: 'tls', label: 'TLS 1.3 + forward secrecy', points: 25, hint: 'Certificate chain, AEAD ciphers' },
  { id: 'headers', label: 'HSTS, CSP, framing controls', points: 35, hint: 'Browser-enforced policy surface' },
  { id: 'leakage', label: 'Zero information leakage', points: 20, hint: 'No server banners or stack traces' },
  { id: 'reputation', label: 'Clean threat-intel signal', points: 20, hint: 'VirusTotal & Safe Browsing clear' },
];

const FAQ_ITEMS = [
  {
    q: 'Is this safe on production APIs?',
    a: 'Yes. AEGIS only runs observable, non-destructive probes. It does not fuzz, brute-force, or mutate data.',
  },
  {
    q: 'How do you prevent SSRF?',
    a: 'Every URL is resolved and checked against private and reserved ranges, including RFC 1918, loopback, and cloud metadata addresses.',
  },
  {
    q: 'How is the score calculated?',
    a: 'A weighted model across four pillars: TLS (25), headers (35), leakage (20), and reputation (20). Unassessed checks reduce coverage, not mystery.',
  },
  {
    q: 'Can I import OpenAPI specs?',
    a: 'Paste a spec URL or upload JSON/YAML, then scan individual operations with optional auth headers.',
  },
  {
    q: 'Can I export a report?',
    a: 'Every completed scan generates an audit-ready PDF with findings, evidence, and remediation guidance.',
  },
];

const PILLARS = [
  {
    n: '01',
    title: 'Transport',
    body: 'Protocol version, AEAD ciphers, certificate window, and hostname match.',
    evidence: 'TLS handshake · certificate chain',
    icon: Lock,
  },
  {
    n: '02',
    title: 'Headers',
    body: 'HSTS, CSP, nosniff, framing, and dangerous CORS on authenticated routes.',
    evidence: 'Response policy · CORS surface',
    icon: Shield,
  },
  {
    n: '03',
    title: 'Leakage',
    body: 'Server banners, X-Powered-By, stack traces, and credential redaction in evidence.',
    evidence: 'Body fingerprints · sanitised excerpts',
    icon: Terminal,
  },
  {
    n: '04',
    title: 'Reputation',
    body: 'VirusTotal and Safe Browsing, with a calm fallback when keys are absent.',
    evidence: 'Domain reputation · redirects',
    icon: Activity,
  },
];

const REPORT_ITEMS = [
  { label: 'Assessment score', detail: '0–100, weighted, with explicit coverage.' },
  { label: 'Findings ledger', detail: 'Severity, evidence, and remediation per failing check.' },
  { label: 'Request inspector', detail: 'Sanitised headers, body, redirects, and timing.' },
  { label: 'Lifecycle diagram', detail: 'Resolve → connect → exchange → verdict, node by node.' },
  { label: 'Latency samples', detail: 'Multi-probe timings with average and failure marks.' },
  { label: 'PDF audit export', detail: 'A portable record for review and sign-off.' },
];

const ASSESSMENT_VECTORS = [
  {
    name: 'HTTPS & TLS Security',
    score: 25,
    max: 25,
    status: 'PASS',
    statusTone: 'good',
    detail: 'Certificate chain valid · Modern TLS 1.3 · Forward secrecy verified',
  },
  {
    name: 'HTTP Security Headers',
    score: 25,
    max: 35,
    status: 'REVIEW',
    statusTone: 'warn',
    detail: 'HSTS enabled · X-Content-Type-Options active · Missing Content-Security-Policy',
  },
  {
    name: 'Information Leakage',
    score: 20,
    max: 20,
    status: 'PASS',
    statusTone: 'good',
    detail: 'Server tokens suppressed · Zero debug traces or credentials exposed',
  },
  {
    name: 'Domain & Redirect Reputation',
    score: 20,
    max: 20,
    status: 'PASS',
    statusTone: 'good',
    detail: 'Clean threat feeds · Safe Browsing clear · Predictable redirect chain',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const scanInputId = useId();
  const [targetUrl, setTargetUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [selectedChecks, setSelectedChecks] = useState<Record<string, boolean>>({
    tls: true,
    headers: true,
    leakage: false,
    reputation: true,
  });
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const estimatedScore = ESTIMATOR_OPTIONS.reduce(
    (acc, opt) => acc + (selectedChecks[opt.id] ? opt.points : 0),
    0,
  );
  const enabledCount = ESTIMATOR_OPTIONS.filter((opt) => selectedChecks[opt.id]).length;
  const grade = estimatedScore >= 90 ? 'A+' : estimatedScore >= 75 ? 'B' : estimatedScore >= 55 ? 'C' : 'F';

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const url = targetUrl.trim();
    if (!url) return toast.error('Enter an API URL to scan.');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return toast.error('URL must begin with http:// or https://');
    }
    try {
      setIsScanning(true);
      toast.loading('Initiating scan…', { id: 'scan-toast' });
      const scan = await createScan(url, 'Triggered from AEGIS landing page');
      toast.success('Scan initiated', { id: 'scan-toast' });
      navigate(`/scan/${scan.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err), { id: 'scan-toast', duration: 5000 });
      setIsScanning(false);
    }
  };

  const handleSelectPrompt = (prompt: MascotPrompt) => {
    setTargetUrl(prompt.sampleUrl);
    const scanSection = document.getElementById('scan');
    if (scanSection) {
      scanSection.scrollIntoView({ behavior: 'smooth' });
    }
    const scanInput = document.getElementById(scanInputId);
    if (scanInput) {
      scanInput.focus();
    }
  };

  const navLinks = [
    { href: '#scan', label: 'Run a scan' },
    { href: '#method', label: 'Method' },
    { href: '#report', label: 'Report' },
    { href: '#questions', label: 'Questions' },
  ];

  return (
    <div className="page-landing refresh-site">
      <a href="#main-content" className="skip-link sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50">Skip to main content</a>
      <header className="site-nav">
        <div className="site-nav-inner">
          <BrandLogo to="/" size="sm" subtitle="API security, made clear" />
          <nav className={`site-links ${mobileNavOpen ? 'is-open' : ''}`} aria-label="Page">
            {navLinks.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="site-actions">
            <ThemeToggle className="site-theme-toggle" />
            {session ? (
              <Link to="/dashboard" className="site-account-link">
                Open console <ArrowRight size={16} />
              </Link>
            ) : (
              <Link to="/auth" className="site-signin-link">Sign in</Link>
            )}
            <a href="#scan" className="site-primary-link">
              Check an API <ArrowRight size={16} />
            </a>
          </div>
          <button
            type="button"
            className="site-menu-toggle"
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {/* Hero Section: Centered Hero + Connected Neurons Background */}
        <section
          id="scan"
          className="home-hero home-hero-centered relative overflow-hidden"
          onMouseMove={handleMouseMove}
        >
          {/* Interactive Connected Neurons Canvas Network */}
          <ConnectedNeuronsCanvas mousePos={mousePos} />

          {/* Subtle cursor-reactive ambient glow animation */}
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{
              background: `radial-gradient(650px circle at ${mousePos.x}% ${mousePos.y}%, rgba(200, 90, 50, 0.08), rgba(31, 61, 43, 0.05) 40%, transparent 75%)`,
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 max-w-4xl mx-auto text-center px-4">
            <div className="home-eyebrow inline-flex items-center gap-2">
              <span className="home-eyebrow-dot" /> API SECURITY CHECKS, MADE SIMPLE
            </div>

            <h1 className="mt-6 font-sans text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-ink leading-[1.08]">
              Know what your API is exposing.
            </h1>

            <p className="mt-5 text-muted text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Run a quick, read-only security review. Get a clear score, the evidence behind it, and practical next steps.
            </p>

            {/* Clean Centered Search Bar */}
            <form onSubmit={handleScanSubmit} className="home-scan-form home-scan-form-centered max-w-2xl mx-auto mt-8">
              <label htmlFor={scanInputId} className="sr-only">Public API endpoint</label>
              <div className="home-scan-control">
                <Globe size={18} className="text-muted" />
                <input
                  id={scanInputId}
                  type="url"
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  placeholder="https://api.example.com/v1"
                  disabled={isScanning}
                  aria-label="Public API endpoint URL"
                />
                <button type="submit" disabled={isScanning || !targetUrl.trim()}>
                  {isScanning ? 'Starting…' : 'Run security check'} <ArrowRight size={17} />
                </button>
              </div>
            </form>

            {/* "Try an example" Quick-Select Pills */}
            <div className="home-example-row justify-center mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-muted font-mono font-medium">Try an example</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {SAMPLE_PRESETS.map((preset) => (
                  <button
                    key={preset.url}
                    type="button"
                    onClick={() => setTargetUrl(preset.url)}
                    disabled={isScanning}
                    className="example-pill"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="home-assurance justify-center mt-6">
              <Shield size={16} />
              <span>Read-only checks. No exploit payloads or data changes.</span>
            </div>
          </div>
        </section>

        {/* Floating Mascot & Interactive Security Questions (Customer Support SaaS Style) */}
        <AegisSentinelMascot onSelectPrompt={handleSelectPrompt} />

        {/* Feature Showcase Banner: Floating Live Preview Card over Balanced Atmospheric Backdrop */}
        <section className="nooks-showcase-section py-14 px-4 sm:px-6 lg:px-8" aria-label="Feature Showcase Preview">
          <div className="nooks-showcase-stage max-w-5xl mx-auto rounded-[32px] relative overflow-hidden p-6 sm:p-12 lg:p-16">
            {/* Scenic atmospheric backdrop visual */}
            <div className="scenic-backdrop-layer absolute inset-0 pointer-events-none" aria-hidden="true" />

            {/* Floating Top Left Metric Chip */}
            <div className="floating-metric-chip floating-chip-tl hidden md:flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-500" />
              <span>SSRF Guard: Private IP ranges blocked</span>
            </div>

            {/* Floating Top Right Metric Chip */}
            <div className="floating-metric-chip floating-chip-tr hidden md:flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-500" />
              <span>Telemetry: 142ms probe latency</span>
            </div>

            {/* Main Floating Center Preview Card */}
            <div className="nooks-floating-preview-card relative z-10 max-w-lg mx-auto rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono text-[11px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 uppercase">
                    LIVE PROBE ACTIVE
                  </span>
                </div>
                <Badge variant="success" size="xs">Verified Host</Badge>
              </div>

              <div className="flex items-center gap-3.5 my-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-forest/10 text-forest">
                  <Globe size={20} />
                </div>
                <div className="min-w-0">
                  <strong className="block truncate font-mono text-[16px] font-semibold text-ink">api.acme.dev</strong>
                  <small className="block text-[12px] text-muted">Production API · last checked just now</small>
                </div>
                <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Check size={14} />
                </span>
              </div>

              <div className="flex items-baseline justify-between rounded-2xl border border-line bg-elevated/70 p-4 sm:p-5">
                <div>
                  <span className="block text-[13.5px] font-semibold text-ink">Security score</span>
                  <small className="text-[12px] text-muted">Across 4 evaluation pillars</small>
                </div>
                <div className="text-right">
                  <strong className="font-sans text-3xl sm:text-4xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                    92<span className="text-lg font-normal text-muted">/100</span>
                  </strong>
                  <span className="block font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted">Grade A+</span>
                </div>
              </div>

              <div className="home-score-track mt-3">
                <span />
              </div>

              <div className="mt-4 divide-y divide-line text-[13px]">
                <div className="flex items-center justify-between py-2.5">
                  <span className="flex items-center gap-2 text-ink">
                    <CheckCircle2 size={15} className="text-emerald-500" />
                    Transport security (TLS 1.3)
                  </span>
                  <strong className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs">Strong</strong>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="flex items-center gap-2 text-ink">
                    <AlertTriangle size={15} className="text-amber-500" />
                    Response headers (HSTS, CSP)
                  </span>
                  <strong className="text-amber-600 dark:text-amber-400 font-semibold text-xs">Review needed</strong>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="flex items-center gap-2 text-ink">
                    <CheckCircle2 size={15} className="text-emerald-500" />
                    Data exposure (Server banners)
                  </span>
                  <strong className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs">Strong</strong>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="flex items-center gap-2 text-ink">
                    <CheckCircle2 size={15} className="text-emerald-500" />
                    Threat reputation (Safe Browsing)
                  </span>
                  <strong className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs">Clear</strong>
                </div>
              </div>

              <div className="home-preview-note mt-4">
                <span>ONE ITEM TO REVIEW</span>
                <p>Content security policy is missing from the response.</p>
              </div>
            </div>

            {/* Floating Bottom Left Metric Chip */}
            <div className="floating-metric-chip floating-chip-bl hidden md:flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-500" />
              <span>TLS 1.3 &amp; Forward Secrecy Validated</span>
            </div>

            {/* Floating Bottom Right Metric Chip */}
            <div className="floating-metric-chip floating-chip-br hidden md:flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-500" />
              <span>Audit-Ready PDF Export Available</span>
            </div>
          </div>
        </section>

        {/* Strong-Coverage / Assessment Showcase Section: Report Summary + 4-Vector Side Panel */}
        <section id="report" className="home-report-section py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="home-section-kicker">A REPORT YOU CAN USE</span>
              <h2 className="mt-2 font-sans text-3xl sm:text-4xl font-bold tracking-tight text-ink">
                Not just a score. A way forward.
              </h2>
              <p className="mt-3 text-muted text-base leading-relaxed">
                See what passed, what needs attention, and what to do next. Open any result to review the evidence.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Structured Report Summary Box (7 Cols) */}
              <div className="lg:col-span-7 home-report-card rounded-3xl p-6 sm:p-8">
                <div className="home-report-card-head">
                  <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-muted">
                    SECURITY ASSESSMENT SUMMARY
                  </span>
                  <Badge variant="success" size="xs">Completed</Badge>
                </div>

                <div className="home-report-score-line my-6 flex items-baseline justify-between">
                  <div>
                    <small className="block text-xs uppercase tracking-wider text-muted font-mono font-medium">Overall score</small>
                    <strong className="text-4xl sm:text-5xl font-sans font-bold text-emerald-600 dark:text-emerald-400">
                      92<span className="text-xl text-muted font-normal">/100</span>
                    </strong>
                  </div>
                  <span className="home-report-grade">Good (A+)</span>
                </div>

                <div className="home-report-divider my-4" />

                <div className="home-report-line flex items-center justify-between text-sm font-medium">
                  <span className="text-ink">Content security policy</span>
                  <Badge variant="warning" size="xs">Review</Badge>
                </div>
                <p className="home-report-evidence text-sm text-muted mt-2 mb-6">
                  Evidence: No Content-Security-Policy header was returned.
                </p>

                <ul className="home-report-list grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6">
                  {REPORT_ITEMS.map((item, index) => (
                    <li key={item.label} className="flex gap-3.5 items-start p-3.5 rounded-xl border border-line bg-canvas transition-colors hover:bg-elevated hover:border-line-strong">
                      <span className="font-mono text-xs font-bold text-forest shrink-0 mt-0.5">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <strong className="block text-[13px] font-semibold text-ink leading-tight">{item.label}</strong>
                        <small className="block mt-1 text-[11.5px] text-muted leading-relaxed">{item.detail}</small>
                      </div>
                    </li>
                  ))}
                </ul>

                <a href="#scan" className="inline-flex items-center gap-2 text-sm font-semibold text-forest hover:underline">
                  Run your own check <ArrowRight size={15} />
                </a>
              </div>

              {/* Side Panel Displaying All 4 Security Assessment Vectors (5 Cols) */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="flex items-center justify-between pb-2 border-b border-line">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted">
                    EVALUATION VECTORS (4/4)
                  </span>
                  <span className="font-mono text-xs text-muted">100 max pts</span>
                </div>

                {ASSESSMENT_VECTORS.map((vec, idx) => (
                  <div
                    key={vec.name}
                    className="assessment-vector-panel rounded-xl border border-line bg-paper p-4 transition-all hover:border-forest/40 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-muted">0{idx + 1}</span>
                        <h3 className="font-sans text-[13.5px] font-semibold text-ink">{vec.name}</h3>
                      </div>
                      <span
                        className={`font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                          vec.statusTone === 'good'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {vec.status}
                      </span>
                    </div>

                    <p className="text-[11.5px] text-muted mt-2 leading-relaxed">{vec.detail}</p>

                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-line font-mono text-[11px]">
                      <span className="text-muted">Weight Contribution</span>
                      <strong className="text-ink font-semibold">
                        {vec.score} / {vec.max} pts
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Proof Ribbon */}
        <section className="home-proof" aria-label="What AEGIS checks">
          <div><strong>4</strong><span>security areas checked</span></div>
          <div><strong>0</strong><span>exploit payloads sent</span></div>
          <div><strong>Evidence</strong><span>behind every result</span></div>
          <div><strong>PDF</strong><span>shareable reports</span></div>
        </section>

        {/* How It Works: 4 Pillars Section (Preserved) */}
        <section id="method" className="home-section home-method">
          <div className="home-section-heading">
            <div>
              <span className="home-section-kicker">HOW IT WORKS</span>
              <h2>One check. Four clear answers.</h2>
            </div>
            <p>AEGIS checks public signals and explains what it found in everyday language.</p>
          </div>
          <div className="home-pillar-grid">
            {PILLARS.map((pillar, index) => (
              <article className="home-pillar-card" key={pillar.title}>
                <span className="home-pillar-number">0{index + 1}</span>
                <span className="home-pillar-icon"><pillar.icon size={20} /></span>
                <h3>{pillar.title}</h3>
                <p>{pillar.body}</p>
                <small>{pillar.evidence}</small>
              </article>
            ))}
          </div>
        </section>

        {/* Interactive Posture Estimator */}
        <section className="home-estimator-section" aria-label="Interactive posture estimator">
          <div className="home-estimator-copy">
            <span className="home-section-kicker">INTERACTIVE GUIDE</span>
            <h2>See what strong coverage looks like.</h2>
            <p>Choose the protections your API has today to see how they contribute to a sample score. This is a planning guide, not a scan result.</p>
            <div className="home-estimator-score">
              <div>
                <small>Example score</small>
                <strong>{estimatedScore}<span>/100</span></strong>
              </div>
              <span className="home-estimator-grade">Grade {grade}</span>
            </div>
            <div className="home-estimator-track">
              <span style={{ width: `${estimatedScore}%` }} />
            </div>
            <small className="home-estimator-note">{enabledCount} of 4 protections selected</small>
          </div>
          <div className="home-estimator-options">
            {ESTIMATOR_OPTIONS.map((option) => (
              <button
                className="home-estimator-option"
                key={option.id}
                type="button"
                aria-pressed={selectedChecks[option.id]}
                onClick={() => setSelectedChecks((current) => ({ ...current, [option.id]: !current[option.id] }))}
              >
                <span className={`home-estimator-check ${selectedChecks[option.id] ? 'selected' : ''}`}>
                  {selectedChecks[option.id] && <Check size={14} />}
                </span>
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
                <em>+{option.points}</em>
              </button>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section id="questions" className="home-faq-section">
          <div className="home-faq-heading">
            <span className="home-section-kicker">COMMON QUESTIONS</span>
            <h2>Good to know before you scan.</h2>
            <p>Get more detail on how AEGIS works and what it checks.</p>
          </div>
          <div className="home-faq-list">
            {FAQ_ITEMS.map((item, index) => (
              <article className="home-faq-item" key={item.q}>
                <button
                  type="button"
                  aria-expanded={openFaq === index}
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                >
                  <span>{item.q}</span>
                  <span>{openFaq === index ? '−' : '+'}</span>
                </button>
                {openFaq === index && <p>{item.a}</p>}
              </article>
            ))}
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="home-final-cta">
          <div>
            <span className="home-section-kicker">START WITH ONE ENDPOINT</span>
            <h2>Get a clearer picture of your API.</h2>
            <p>Run a read-only security check and review the evidence for yourself.</p>
          </div>
          <div className="home-final-cta-actions mt-8 flex flex-wrap items-center justify-center gap-4">
            <a href="#scan" className="home-cta-primary">
              <span>Run a security check</span>
              <ArrowRight size={16} />
            </a>
            <Link to={session ? '/dashboard' : '/auth?mode=signup'} className="home-cta-secondary">
              {session ? 'Open your console' : 'Create an account'}
            </Link>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <BrandLogo to="/" size="sm" subtitle="API security, made clear" />
        <div>
          <a href="#method">How it works</a>
          <Link to="/spec">API catalog</Link>
          <Link to="/settings">System status</Link>
        </div>
        <span>© {CURRENT_YEAR} AEGIS</span>
      </footer>
    </div>
  );
}
