import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useScan } from '../hooks/useScan';
import SimilarApisPanel from '../components/SimilarApisPanel';
import ApiComparisonPanel from '../components/ApiComparisonPanel';
import { Badge, Button, Spinner } from '../components/ui';

export default function Recommendations() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { scan, isLoading, error, loadScan } = useScan();
  const [comparisonRefresh, setComparisonRefresh] = useState(0);

  useEffect(() => {
    if (scanId) void loadScan(scanId);
  }, [scanId, loadScan]);

  if (isLoading && !scan) {
    return <div className="aegis-container recommendations-state"><Spinner size="lg" label="Loading recommendation workspace" /></div>;
  }

  if (!scan) {
    return <div className="aegis-container recommendations-state"><div><h1>Recommendations unavailable</h1><p>{error || 'This scan could not be loaded.'}</p><Button variant="secondary" onClick={() => navigate(session ? '/dashboard' : '/')}>Back to scans</Button></div></div>;
  }

  const scanReady = scan.status === 'completed' || scan.status === 'failed';

  return (
    <div className="aegis-container page-recommendations pb-16">
      <header className="recommendation-heading">
        <div>
          <Link to={`/scan/${scan.id}`} className="recommendation-back"><ArrowLeft size={15} /> Back to assessment</Link>
          <p className="aegis-eyebrow">Decision workspace / recommendations</p>
          <h1>Find a stronger fit.</h1>
          <p className="recommendation-lede">Discover comparable APIs, assess their security, and compare verified evidence in one place.</p>
        </div>
        <div className="recommendation-source">
          <span className="recommendation-source-icon"><ShieldCheck size={19} /></span>
          <div><small>BASED ON THIS ASSESSMENT</small><strong>{scan.hostname}</strong><span>{scan.url}</span></div>
          <Badge variant={scanReady ? 'success' : 'cyan'} size="xs">{scan.status}</Badge>
        </div>
      </header>

      {!scanReady ? (
        <section className="recommendation-wait"><span><Sparkles size={20} /></span><div><h2>Recommendations unlock when the scan is ready</h2><p>The current assessment is {scan.status}. You can return to the report while it finishes.</p></div><Link to={`/scan/${scan.id}`} className="recommendation-inline-link">View assessment <ArrowUpRight size={15} /></Link></section>
      ) : (
        <div className="recommendation-content">
          <SimilarApisPanel scanId={scan.id} scanStatus={scan.status} targetUrl={scan.url} targetHostname={scan.hostname} onScansUpdated={() => setComparisonRefresh((value) => value + 1)} />
          <ApiComparisonPanel scanId={scan.id} scanStatus={scan.status} refreshKey={comparisonRefresh} />
        </div>
      )}
    </div>
  );
}
