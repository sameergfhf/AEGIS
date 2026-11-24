import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, RotateCw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { discoverAlternatives, getAlternatives, getAlternativeScans, scanAlternativeApis } from '../services/api';
import type { AlternativeApi, AlternativeScanResult } from '../types';
import { Badge, Button, Modal, Spinner } from './ui';

interface SimilarApisPanelProps {
  scanId: string;
  scanStatus: string;
  targetUrl: string;
  targetHostname: string;
  onScansUpdated?: () => void;
}

function scanLabel(result?: AlternativeScanResult, alternative?: AlternativeApi) {
  const status = result?.status ?? alternative?.scan_status;
  if (status === 'completed') {
    if (result?.assessment_score != null) return 'Assessed';
    if ((result?.assessment_coverage ?? alternative?.scan_coverage ?? 0) > 0) return 'Partial results';
    return 'No score available';
  }
  if (status === 'not_tested_auth_required') return 'Login required';
  if (status === 'failed') return 'Scan failed';
  if (status === 'endpoint_unverified' || alternative?.endpoint_status === 'endpoint_unverified') return 'Unverified';
  return 'Not assessed';
}

export default function SimilarApisPanel({ scanId, scanStatus, targetUrl, targetHostname, onScansUpdated }: SimilarApisPanelProps) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAlternatives>> | null>(null);
  const [scanResults, setScanResults] = useState<Record<string, AlternativeScanResult>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [inspecting, setInspecting] = useState<AlternativeScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (scanStatus !== 'completed' && scanStatus !== 'failed') return;
    setIsLoading(true);
    setError(null);
    try {
      const [alternatives, existingScans] = await Promise.all([
        getAlternatives(scanId),
        getAlternativeScans(scanId).catch(() => ({ scan_id: scanId, total_scanned: 0, results: [] })),
      ]);
      setData(alternatives);
      setScanResults(Object.fromEntries(existingScans.results.map((item) => [item.alternative_id, item])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load recommendations.');
    } finally {
      setIsLoading(false);
    }
  }, [scanId, scanStatus]);

  useEffect(() => { void loadData(); }, [loadData]);

  const scannable = useMemo(() => data?.alternatives.filter((item) => item.endpoint_status !== 'endpoint_unverified') ?? [], [data]);
  const allSelected = scannable.length > 0 && scannable.every((item) => selectedIds.has(item.id));
  const previouslyScannedSelected = scannable.filter((item) => selectedIds.has(item.id) && (scanResults[item.id] || item.scan_status)).length;
  const topRelevanceMatch = data?.alternatives.reduce<AlternativeApi | null>((best, item) => !best || item.relevance_score > best.relevance_score ? item : best, null);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setError(null);
    try {
      const result = await discoverAlternatives(scanId);
      setData(result);
      setSelectedIds(new Set());
      if (result.cache_status === 'fallback') toast('Live directory unavailable; local options are still available.');
      else toast.success(result.is_cached ? 'Showing cached directory results.' : 'Live recommendations refreshed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find API alternatives.');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleScanSelected = async () => {
    setShowConsent(false);
    setIsScanning(true);
    const toastId = toast.loading(`Assessing ${selectedIds.size} selected APIs…`);
    try {
      const result = await scanAlternativeApis(scanId, Array.from(selectedIds));
      const next = { ...scanResults };
      for (const item of result.results) next[item.alternative_id] = item;
      setScanResults(next);
      onScansUpdated?.();
      const alternatives = await getAlternatives(scanId);
      setData(alternatives);
      toast.success(`Finished ${result.results.length} API assessment${result.results.length === 1 ? '' : 's'}.`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not assess the selected APIs.', { id: toastId });
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanAll = () => {
    setSelectedIds(new Set(scannable.map((item) => item.id)));
    setShowConsent(true);
  };

  if (scanStatus !== 'completed' && scanStatus !== 'failed') return null;
  const category = data?.user_category || data?.category || 'APIs';

  return (
    <>
      <section className="recommend-option-panel" aria-label="Similar APIs and alternatives">
        <div className="recommend-option-heading">
          <div className="recommend-panel-icon"><Search size={18} /></div>
          <div className="recommend-panel-title"><h2>Find alternatives</h2><p>Options similar to {targetHostname}{category !== 'APIs' ? ` · ${category}` : ''}</p></div>
          <Button variant="secondary" size="sm" onClick={handleDiscover} disabled={isDiscovering || isLoading || isScanning} leftIcon={isDiscovering ? <Spinner size="sm" label="" /> : <RotateCw size={14} />}>
            {data?.alternatives.length ? 'Refresh Live Recommendations' : 'Find APIs'}
          </Button>
        </div>

        {data && <div className="recommend-discovery-status" role="status"><span>{data.source_summary}</span><Badge variant={data.cache_status === 'fallback' || data.cache_status === 'not_requested' ? 'warning' : data.is_cached ? 'neutral' : 'success'} size="xs">{data.cache_status === 'fallback' ? 'Local fallback' : data.is_cached ? 'Cached results' : data.cache_status === 'not_requested' ? 'Local catalogue' : 'Live refresh'}</Badge></div>}
        {data?.warnings?.map((warning) => <p className="recommend-discovery-warning" role="status" key={warning}>{warning}</p>)}

        {data && data.alternatives.length > 0 && <div className="recommend-list-toolbar"><span>{data.alternatives.length} options · {scannable.length} verified and ready to assess</span><div className="recommend-batch-actions"><button type="button" onClick={() => setSelectedIds(allSelected ? new Set() : new Set(scannable.map((item) => item.id)))} disabled={isScanning || scannable.length === 0}>{allSelected ? 'Clear selection' : 'Select verified'}</button>{selectedIds.size > 0 && <Button variant="secondary" size="sm" disabled={isScanning} onClick={() => setShowConsent(true)}>{`Assess selected (${selectedIds.size})`}</Button>}<Button variant="primary" size="sm" disabled={isScanning || scannable.length === 0} onClick={handleScanAll} leftIcon={isScanning ? <Spinner size="sm" label="" /> : <ShieldCheck size={14} />}>{isScanning ? 'Assessing all…' : `Scan all verified (${scannable.length})`}</Button></div></div>}

        {isLoading && <div className="recommend-state"><Spinner size="md" label="Loading API options" /><span>Loading API options…</span></div>}
        {isDiscovering && <div className="recommend-state"><Spinner size="md" label="Searching API directories" /><span>Finding comparable services…</span></div>}
        {error && <div className="recommend-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadData()}>Try again</button></div>}
        {!isLoading && !isDiscovering && !error && data?.alternatives.length === 0 && <div className="recommend-empty"><Sparkles size={18} /><div><strong>No alternatives found yet</strong><p>Try refreshing the list after confirming the API category.</p></div><Button variant="secondary" size="sm" onClick={handleDiscover}>Search again</Button></div>}
        {!isLoading && !data && !error && <div className="recommend-empty"><Sparkles size={18} /><div><strong>Ready to find similar APIs</strong><p>We’ll look for services that offer similar capabilities to {targetHostname}.</p></div><Button variant="secondary" size="sm" onClick={handleDiscover}>Find APIs</Button></div>}

        {!!data?.alternatives.length && <div className="recommend-option-list">{data.alternatives.map((alternative: AlternativeApi) => {
          const result = scanResults[alternative.id];
          const status = scanLabel(result, alternative);
          const verified = alternative.endpoint_status !== 'endpoint_unverified';
          const selected = selectedIds.has(alternative.id);
          return (
            <article className={`recommend-option ${selected ? 'is-selected' : ''}`} key={alternative.id}>
              <div className="recommend-option-header">
                <div className="recommend-header-left">
                  <button
                    className="recommend-select"
                    type="button"
                    aria-label={`${selected ? 'Remove' : 'Select'} ${alternative.provider_name}`}
                    aria-pressed={selected}
                    disabled={!verified || isScanning}
                    onClick={() => setSelectedIds((current) => {
                      const next = new Set(current);
                      if (next.has(alternative.id)) next.delete(alternative.id);
                      else next.add(alternative.id);
                      return next;
                    })}
                  >
                    {selected && <Check size={14} />}
                  </button>
                  <div className="recommend-title-group">
                    <div className="recommend-provider-line">
                      <h3 className="recommend-provider-name">{alternative.provider_name}</h3>
                      <span className="recommend-api-name">{alternative.api_name}</span>
                    </div>
                  </div>
                </div>

                <div className="recommend-badges-row">
                  {topRelevanceMatch?.id === alternative.id && (
                    <Badge variant="success" size="xs">Best match</Badge>
                  )}
                  {alternative.relevance_score > 0 && (
                    <Badge variant="info" size="xs">{Math.round(alternative.relevance_score * 100)}% relevance</Badge>
                  )}
                  <Badge variant={alternative.discovery_source === 'live_directory' ? 'cyan' : 'neutral'} size="xs">
                    {alternative.discovery_source === 'live_directory' ? 'Live directory' : 'Local catalogue'}
                  </Badge>
                  <Badge variant={alternative.verification_status === 'verified' ? 'success' : 'warning'} size="xs">
                    {alternative.verification_status === 'verified' ? 'Verified' : 'Unverified'}
                  </Badge>
                </div>
              </div>

              <div className="recommend-option-body">
                <p className="recommend-desc">{alternative.description || alternative.main_functionality}</p>

                <div className="recommend-meta-pills">
                  <span className={`recommend-status-pill ${status === 'Assessed' ? 'status-good' : status === 'Not assessed' ? 'status-muted' : 'status-pending'}`}>
                    <ShieldCheck size={13} />
                    {status === 'Assessed' ? `${result?.assessment_score?.toFixed(0)}/100 · Security score` : status}
                  </span>
                  {result && result.assessment_score == null && result.status === 'completed' && (
                    <span className="recommend-meta-item">{result.assessment_coverage.toFixed(0)}% scan coverage</span>
                  )}
                  {alternative.authentication_methods?.length ? (
                    <span className="recommend-meta-item">
                      Auth: {alternative.authentication_methods.join(', ')}
                    </span>
                  ) : null}
                  {(alternative.pricing_details || alternative.pricing_model) && (
                    <span className="recommend-meta-item">
                      Pricing: {alternative.pricing_details || alternative.pricing_model}
                    </span>
                  )}
                  {!verified && <span className="recommend-meta-warning">Unverified endpoint</span>}
                </div>

                <details className="recommend-option-details">
                  <summary>Full metadata &amp; links</summary>
                  <div className="recommend-detail-body">
                    <p>{alternative.main_functionality || alternative.description}</p>
                    {alternative.relevance_confidence != null && (
                      <div>
                        <strong>Match confidence</strong>
                        <span>{Math.round(alternative.relevance_confidence * 100)}% · category metadata match confidence</span>
                      </div>
                    )}
                    <div className="recommend-detail-links">
                      {alternative.documentation_url && <a href={alternative.documentation_url} target="_blank" rel="noreferrer noopener">Documentation <ExternalLink size={12} /></a>}
                      {alternative.website_url && <a href={alternative.website_url} target="_blank" rel="noreferrer noopener">Website <ExternalLink size={12} /></a>}
                      {alternative.openapi_spec_url && <a href={alternative.openapi_spec_url} target="_blank" rel="noreferrer noopener">OpenAPI spec <ExternalLink size={12} /></a>}
                      {alternative.pricing_url && <a href={alternative.pricing_url} target="_blank" rel="noreferrer noopener">Pricing <ExternalLink size={12} /></a>}
                    </div>
                  </div>
                </details>
              </div>

              <div className="recommend-option-footer">
                <div className="recommend-footer-actions">
                  {verified && (
                    <Button
                      variant="primary"
                      size="xs"
                      disabled={isScanning}
                      leftIcon={<ShieldCheck size={13} />}
                      onClick={() => { setSelectedIds(new Set([alternative.id])); setShowConsent(true); }}
                    >
                      {result ? 'Re-scan API' : 'Scan API'}
                    </Button>
                  )}
                  {result?.findings.length ? (
                    <button type="button" className="recommend-findings-link" onClick={() => setInspecting(result)}>
                      View findings ({result.findings.length})
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}</div>}
        <p className="recommend-target-note">Compared against <code>{targetUrl}</code></p>
      </section>

      <Modal isOpen={showConsent} onClose={() => setShowConsent(false)} title={`Assess ${selectedIds.size} API${selectedIds.size === 1 ? '' : 's'} together`} description="AEGIS will use the existing read-only scanner for each selected, verified endpoint.">
        <div className="recommend-consent"><p>Each assessment checks TLS, response headers, data exposure, and domain reputation. No write requests or exploit payloads are sent.</p><p><strong>{selectedIds.size}</strong> verified endpoint{selectedIds.size === 1 ? '' : 's'} selected. Results will be saved separately for each API.</p>{previouslyScannedSelected > 0 && <p>{previouslyScannedSelected} previously assessed endpoint{previouslyScannedSelected === 1 ? ' will' : 's will'} be re-assessed and its latest result will replace the previous one.</p>}</div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowConsent(false)}>Cancel</Button><Button variant="primary" disabled={isScanning || selectedIds.size === 0} onClick={() => void handleScanSelected()}>Start {selectedIds.size > 1 ? 'assessments' : 'assessment'}</Button></div>
      </Modal>

      <Modal isOpen={!!inspecting} onClose={() => setInspecting(null)} title={inspecting ? `${inspecting.provider_name} findings` : undefined} description={inspecting?.status_message}>
        {inspecting && <div className="recommend-findings-list">{inspecting.findings.length ? inspecting.findings.map((finding, index) => <article key={`${finding.check ?? 'finding'}-${index}`}><Badge variant={finding.severity === 'critical' || finding.severity === 'high' ? 'critical' : 'warning'} size="xs">{finding.severity || finding.status}</Badge><strong>{finding.check || finding.module_name || 'Assessment result'}</strong><p>{finding.detail || finding.why_it_matters || 'See the individual finding for details.'}</p>{finding.remediation && <small>Next step: {finding.remediation}</small>}</article>) : <p>No actionable findings were returned.</p>}</div>}
      </Modal>
    </>
  );
}
