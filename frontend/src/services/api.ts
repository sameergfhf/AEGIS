import axios, { AxiosError } from 'axios';
import type {
  ComparisonResult,
  Finding,
  HealthStatus,
  HistoryResponse,
  OperationScanRequest,
  Scan,
  SpecAnalysis,
  Visualizations,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 30_000,
});

// ── Scans ─────────────────────────────────────────────────────────────────────

export async function createScan(url: string, notes?: string): Promise<Scan> {
  const { data } = await api.post<Scan>('/scans', { url, notes });
  return data;
}

export async function getScan(scanId: string): Promise<Scan> {
  const { data } = await api.get<Scan>(`/scans/${scanId}`);
  return data;
}

export async function getFindings(scanId: string): Promise<Finding[]> {
  const { data } = await api.get<Finding[]>(`/scans/${scanId}/findings`);
  return data;
}

export async function getVisualizations(scanId: string): Promise<Visualizations> {
  const { data } = await api.get<Visualizations>(`/scans/${scanId}/visualizations`);
  return data;
}

export function getReportUrl(scanId: string): string {
  return `/api/scans/${scanId}/report`;
}

export async function getScanHistory(limit = 20, offset = 0): Promise<HistoryResponse> {
  const { data } = await api.get<HistoryResponse>('/scans/history', {
    params: { limit, offset },
  });
  return data;
}

export async function compareScans(
  scanIdA: string,
  scanIdB: string,
): Promise<ComparisonResult> {
  const { data } = await api.post<ComparisonResult>(`/scans/${scanIdA}/compare`, {
    scan_id_a: scanIdA,
    scan_id_b: scanIdB,
  });
  return data;
}

// ── OpenAPI Specs ─────────────────────────────────────────────────────────────

export async function analyzeSpecUrl(url: string): Promise<SpecAnalysis> {
  const form = new FormData();
  form.append('url', url);
  const { data } = await api.post<SpecAnalysis>('/specifications/analyze', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function analyzeSpecFile(file: File): Promise<SpecAnalysis> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<SpecAnalysis>('/specifications/analyze', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthStatus> {
  const { data } = await api.get<HealthStatus>('/health');
  return data;
}

// ── Operation Scan ────────────────────────────────────────────────────────────

/**
 * Scan a single OpenAPI operation imported from the Spec Analyzer.
 * The server validates the (spec_id, method, path) against the cached spec
 * before building the target URL and running the scan.
 */
export async function scanOperation(req: OperationScanRequest): Promise<Scan> {
  const { data } = await api.post<Scan>('/scans/operation', req);
  return data;
}

// ── Error helpers ─────────────────────────────────────────────────────────────

/**
 * Convert any caught error into a human-readable message.
 * For Pydantic validation errors (422) the structured `detail` array is used
 * so the user sees exactly which field failed and why.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const detail = error.response?.data?.detail;

    // Pydantic v2 returns an array of {loc, msg, type} objects
    if (Array.isArray(detail)) {
      return detail
        .map((d: { loc?: (string | number)[]; msg?: string }) => {
          // loc is e.g. ["body", "base_url"] — take the last element as the field name
          const field = d.loc?.filter((s) => s !== 'body').join(' → ');
          const msg = d.msg ?? 'invalid';
          return field ? `${field}: ${msg}` : msg;
        })
        .join('\n');
    }

    if (typeof detail === 'string') return detail;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}
