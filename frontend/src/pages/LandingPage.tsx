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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { createScan, getErrorMessage } from '../services/api';
import BrandLogo from '../components/BrandLogo';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { Badge } from '../components/ui';

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

export default function LandingPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const scanInputId = useId();
  const [targetUrl, setTargetUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
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

  const navLinks = [
    { href: '#scan', label: 'Run a scan' },
    { href: '#method', label: 'Method' },
    { href: '#report', label: 'Report' },
    { href: '#questions', label: 'Questions' },
  ];

  return (
    <div className="page-landing refresh-site">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="site-nav">
        <div className="site-nav-inner">
          <BrandLogo to="/" size="sm" subtitle="API security, made clear" />
          <nav className={`site-links ${mobileNavOpen ? 'is-open' : ''}`} aria-label="Page">
            {navLinks.map((item) => <a key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)}>{item.label}</a>)}
          </nav>
          <div className="site-actions">
            <ThemeToggle className="site-theme-toggle" />
            {session ? <Link to="/dashboard" className="site-account-link">Open console <ArrowRight size={16} /></Link> : <Link to="/auth" className="site-signin-link">Sign in</Link>}
            <a href="#scan" className="site-primary-link">Check an API <ArrowRight size={16} /></a>
          </div>
          <button type="button" className="site-menu-toggle" aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(!mobileNavOpen)}>{mobileNavOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section id="scan" className="home-hero">
          <div className="home-hero-grid">
            <div className="home-hero-copy">
              <div className="home-eyebrow"><span className="home-eyebrow-dot" /> API SECURITY CHECKS, MADE SIMPLE</div>
              <h1>Know what your API is exposing.</h1>
              <p>Run a quick, read-only security review. Get a clear score, the evidence behind it, and practical next steps.</p>
              <form onSubmit={handleScanSubmit} className="home-scan-form">
                <label htmlFor={scanInputId}>Public API endpoint</label>
                <div className="home-scan-control"><Globe size={18} /><input id={scanInputId} type="url" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://api.example.com/v1" disabled={isScanning} /><button type="submit" disabled={isScanning || !targetUrl.trim()}>{isScanning ? 'Starting…' : 'Run security check'} <ArrowRight size={17} /></button>
                  <div className="home-example-row"><span>Try an example</span>{SAMPLE_PRESETS.map((preset) => <button key={preset.url} type="button" onClick={() => setTargetUrl(preset.url)} disabled={isScanning}>{preset.label}</button>)}</div>
                </div>
              </form>
              <div className="home-assurance"><Shield size={16} /><span>Read-only checks. No exploit payloads or data changes.</span></div>
            </div>

            <div className="home-preview" aria-label="Example security report preview">
              <div className="home-preview-top"><div><span className="home-preview-dot" /><span>EXAMPLE REPORT</span></div><span>API HEALTH</span></div>
              <div className="home-preview-target"><span className="home-preview-target-icon"><Globe size={18} /></span><div><strong>api.acme.dev</strong><small>Production API · last checked just now</small></div><span className="home-preview-check"><Check size={15} /></span></div>
              <div className="home-preview-score"><div><span>Security score</span><small>Across 4 checks</small></div><strong>92<span>/100</span></strong></div>
              <div className="home-score-track"><span /></div>
              <div className="home-preview-checks">
                {[['Transport security','Strong','good'],['Response headers','Review needed','warn'],['Data exposure','Strong','good'],['Threat reputation','Clear','good']].map(([label,value,tone])=><div className="home-check-row" key={label}><span className={`home-check-status ${tone}`}><Check size={13} /></span><span>{label}</span><strong className={tone}>{value}</strong></div>)}
              </div>
              <div className="home-preview-note"><span>ONE ITEM TO REVIEW</span><p>Content security policy is missing from the response.</p></div>
            </div>
          </div>
        </section>

        <section className="home-proof" aria-label="What AEGIS checks">
          <div><strong>4</strong><span>security areas checked</span></div><div><strong>0</strong><span>exploit payloads sent</span></div><div><strong>Evidence</strong><span>behind every result</span></div><div><strong>PDF</strong><span>shareable reports</span></div>
        </section>

        <section id="method" className="home-section home-method">
          <div className="home-section-heading"><div><span className="home-section-kicker">HOW IT WORKS</span><h2>One check. Four clear answers.</h2></div><p>AEGIS checks public signals and explains what it found in everyday language.</p></div>
          <div className="home-pillar-grid">{PILLARS.map((pillar,index)=><article className="home-pillar-card" key={pillar.title}><span className="home-pillar-number">0{index+1}</span><span className="home-pillar-icon"><pillar.icon size={20} /></span><h3>{pillar.title}</h3><p>{pillar.body}</p><small>{pillar.evidence}</small></article>)}</div>
        </section>

        <section id="report" className="home-report-section">
          <div className="home-report-layout"><div><span className="home-section-kicker">A REPORT YOU CAN USE</span><h2>Not just a score. A way forward.</h2><p>See what passed, what needs attention, and what to do next. Open any result to review the evidence.</p><ul className="home-report-list">{REPORT_ITEMS.slice(0,4).map((item,index)=><li key={item.label}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}</ul></div><div className="home-report-card"><div className="home-report-card-head"><span>SECURITY REVIEW</span><Badge variant="success" size="xs">Completed</Badge></div><div className="home-report-score-line"><div><small>Overall score</small><strong>92<span>/100</span></strong></div><span className="home-report-grade">Good</span></div><div className="home-report-divider" /><div className="home-report-line"><span>Content security policy</span><Badge variant="warning" size="xs">Review</Badge></div><p className="home-report-evidence">Evidence: No Content-Security-Policy header was returned.</p><a href="#scan">Run your own check <ArrowRight size={15} /></a></div></div>
        </section>

        <section className="home-estimator-section" aria-label="Interactive posture estimator">
          <div className="home-estimator-copy"><span className="home-section-kicker">INTERACTIVE GUIDE</span><h2>See what strong coverage looks like.</h2><p>Choose the protections your API has today to see how they contribute to a sample score. This is a planning guide, not a scan result.</p><div className="home-estimator-score"><div><small>Example score</small><strong>{estimatedScore}<span>/100</span></strong></div><span className="home-estimator-grade">Grade {grade}</span></div><div className="home-estimator-track"><span style={{ width: `${estimatedScore}%` }} /></div><small className="home-estimator-note">{enabledCount} of 4 protections selected</small></div>
          <div className="home-estimator-options">{ESTIMATOR_OPTIONS.map((option)=><button className="home-estimator-option" key={option.id} type="button" aria-pressed={selectedChecks[option.id]} onClick={()=>setSelectedChecks((current)=>({...current,[option.id]:!current[option.id]}))}><span className={`home-estimator-check ${selectedChecks[option.id]?'selected':''}`}>{selectedChecks[option.id]&&<Check size={14}/>}</span><span><strong>{option.label}</strong><small>{option.hint}</small></span><em>+{option.points}</em></button>)}</div>
        </section>

        <section id="questions" className="home-faq-section"><div className="home-faq-heading"><span className="home-section-kicker">COMMON QUESTIONS</span><h2>Good to know before you scan.</h2><p>Get more detail on how AEGIS works and what it checks.</p></div><div className="home-faq-list">{FAQ_ITEMS.map((item,index)=><article className="home-faq-item" key={item.q}><button type="button" aria-expanded={openFaq===index} onClick={()=>setOpenFaq(openFaq===index?null:index)}><span>{item.q}</span><span>{openFaq===index?'−':'+'}</span></button>{openFaq===index&&<p>{item.a}</p>}</article>)}</div></section>

        <section className="home-final-cta"><div><span className="home-section-kicker">START WITH ONE ENDPOINT</span><h2>Get a clearer picture of your API.</h2><p>Run a read-only security check and review the evidence for yourself.</p></div><div><a href="#scan" className="site-primary-link">Run a security check <ArrowRight size={16} /></a><Link to={session?'/dashboard':'/auth'} className="home-cta-secondary">{session?'Open your console':'Create an account'}</Link></div></section>
      </main>
      <footer className="home-footer"><BrandLogo to="/" size="sm" subtitle="API security, made clear"/><div><a href="#method">How it works</a><Link to="/spec">API catalog</Link><Link to="/settings">System status</Link></div><span>© {CURRENT_YEAR} AEGIS</span></footer>
    </div>
  );
}
