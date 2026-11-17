import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, RotateCw, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiComparison, recalculateApiComparison } from '../services/api';
import type { ApiComparisonResponse, ComparedAlternative } from '../types';
import { Badge, Button, Spinner } from './ui';

interface ApiComparisonPanelProps {
  scanId: string;
  scanStatus: string;
  refreshKey?: number;
}

function hasUsableResult(alternative: ComparedAlternative) {
  return alternative.assessment_score != null || alternative.assessment_coverage > 0;
}

function resultLabel(alternative: ComparedAlternative) {
  if (alternative.scan_status === 'not_assessed') return 'Not assessed';
  if (alternative.scan_status === 'endpoint_unverified') return 'Endpoint unverified';
  if (alternative.scan_status === 'failed') return 'Scan failed';
  if (alternative.scan_status === 'not_tested_auth_required') return 'Login required';
  if (alternative.assessment_score != null) return 'Assessed';
  if (alternative.assessment_coverage > 0) return 'Partial results';
  return 'No score available';
}

export default function ApiComparisonPanel({ scanId, scanStatus, refreshKey = 0 }: ApiComparisonPanelProps) {
  const [data, setData] = useState<ApiComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'results' | 'pending'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadComparison = useCallback(async () => {
    if (scanStatus !== 'completed' && scanStatus !== 'failed') return;
    setIsLoading(true);
    setError(null);
    try {
      setData(await getApiComparison(scanId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the comparison.');
    } finally {
      setIsLoading(false);
    }
  }, [scanId, scanStatus]);

  useEffect(() => { void loadComparison(); }, [loadComparison, refreshKey]);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      setData(await recalculateApiComparison(scanId));
      toast.success('Comparison updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the comparison.');
    } finally {
      setIsRecalculating(false);
    }
  };

  const alternatives = useMemo(() => {
    if (!data) return [];
    return data.alternatives.filter((item) => filter === 'all' || (filter === 'results' ? hasUsableResult(item) : !hasUsableResult(item)));
  }, [data, filter]);

  if (scanStatus !== 'completed' && scanStatus !== 'failed') return null;
  const best = data?.alternatives.find((item) => item.id === data.summary.best_match_id);

  return (
    <section className="recommend-comparison" aria-label="API comparison">
      <div className="recommend-comparison-heading"><div><p>COMPARE THE EVIDENCE</p><h2>Which option fits best?</h2><span>Scores appear only when assessment data is available.</span></div><Button variant="secondary" size="sm" disabled={isLoading || isRecalculating} onClick={() => void handleRecalculate()} leftIcon={<RotateCw size={14} className={isRecalculating ? 'animate-spin' : ''} />}>{isRecalculating ? 'Updating…' : 'Update comparison'}</Button></div>

      {isLoading && !data && <div className="recommend-state"><Spinner size="md" label="Loading comparison" /><span>Preparing the comparison…</span></div>}
      {error && !data && <div className="recommend-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadComparison()}>Try again</button></div>}
      {data && <>
        <div className="recommend-verdict"><span className="recommend-verdict-icon"><Trophy size={17} /></span><div><small>BEST CURRENT MATCH</small><strong>{best ? `${best.provider_name} · ${best.api_name}` : 'No stronger alternative verified yet'}</strong><p>{data.summary.headline}</p></div><span className="recommend-verdict-count">{data.alternatives.length} options</span></div>

        <div className="recommend-table-toolbar"><div className="recommend-filter-group" role="group" aria-label="Filter comparison results"><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All <span>{data.alternatives.length}</span></button><button type="button" aria-pressed={filter === 'results'} onClick={() => setFilter('results')}>With results <span>{data.alternatives.filter(hasUsableResult).length}</span></button><button type="button" aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>No result <span>{data.alternatives.filter((item) => !hasUsableResult(item)).length}</span></button></div><span className="recommend-baseline-note">Compared with {data.baseline.name}</span></div>

        {alternatives.length === 0 ? <div className="recommend-empty"><div><strong>No options in this view</strong><p>Change the filter to see other APIs.</p></div></div> : <div className="recommend-table-wrap"><table className="recommend-table"><thead><tr><th>API</th><th>Match</th><th>Security score</th><th>Vs. current</th><th>Assessment</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>
          <tr className="recommend-baseline-row"><td><strong>{data.baseline.name}</strong><small>{data.baseline.hostname} · current API</small></td><td><Badge variant="neutral" size="xs">Current</Badge></td><td><span className="recommend-table-score">{data.baseline.assessment_score == null ? '—' : `${data.baseline.assessment_score.toFixed(0)}/100`}</span></td><td>—</td><td><span className="recommend-result-state">{data.baseline.assessment_score == null ? 'No score' : `${data.baseline.assessment_coverage.toFixed(0)}% evidence`}</span></td><td /></tr>
          {alternatives.map((alternative: ComparedAlternative) => {
            const hasResult = hasUsableResult(alternative);
            const status = resultLabel(alternative);
            const expanded = expandedId === alternative.id;
            return <Fragment key={alternative.id}>
              <tr className={hasResult ? '' : 'recommend-no-result-row'}>
                <td><strong>{alternative.provider_name}</strong><small>{alternative.api_name}</small></td>
                <td><span className={`recommend-compat compat-${alternative.compatibility_level}`}>{alternative.compatibility_level === 'unknown' ? 'Unknown' : `${alternative.compatibility_level} match`}</span><small className="recommend-row-label">{alternative.recommendation_label}</small></td>
                <td><span className="recommend-table-score">{alternative.assessment_score == null ? '—' : `${alternative.assessment_score.toFixed(0)}/100`}</span>{alternative.assessment_score != null && <small className="recommend-coverage">{alternative.assessment_coverage.toFixed(0)}% evidence</small>}</td>
                <td>{alternative.score_difference == null ? '—' : <span className={alternative.score_difference > 0 ? 'recommend-delta-up' : alternative.score_difference < 0 ? 'recommend-delta-down' : ''}>{alternative.score_difference > 0 ? '+' : ''}{alternative.score_difference.toFixed(1)}</span>}</td>
                <td><span className={`recommend-result-state ${hasResult ? 'has-result' : ''}`}>{status}</span></td>
                <td><button className="recommend-expand" type="button" aria-label={`${expanded ? 'Hide' : 'Show'} details for ${alternative.provider_name}`} aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : alternative.id)}><ChevronDown size={15} /></button></td>
              </tr>
              {expanded && <tr className="recommend-detail-row"><td colSpan={6}><p>{alternative.summary_explanation}</p>{alternative.strengths.length > 0 && <div><strong>Good to know</strong><span>{alternative.strengths.slice(0, 2).join(' · ')}</span></div>}{alternative.weaknesses.length > 0 && <div><strong>Limitations</strong><span>{alternative.weaknesses.slice(0, 2).join(' · ')}</span></div>}{!hasResult && <div><strong>Next step</strong><span>Assess this verified endpoint to compare its security score with the current API.</span></div>}</td></tr>}
            </Fragment>;
          })}
        </tbody></table></div>}
        <details className="recommend-method-note"><summary>How the recommendation is decided</summary><p>{data.summary.overall_conclusion}</p><span>Security evidence is based on completed scans. Unassessed APIs are not ranked as safer.</span></details>
      </>}
    </section>
  );
}
