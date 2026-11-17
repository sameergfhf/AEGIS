import axios, { AxiosError } from 'axios';
import { supabase } from '../lib/supabase';
import {
  persistSpecToSupabase,
} from './supabaseService';
import type {
  AlternativesResponse,
  AlternativeScanResult,
  AlternativeScansListResponse,
  ApiCategoryResult,
  ApiComparisonResponse,
  ComparisonRecalculateRequest,
  ComparisonResult,
  Finding,
  HealthStatus,
  HistoryResponse,
  OperationScanRequest,
  Scan,
  ScheduledScanExecution,
  ScheduledWorkspaceScan,
  WorkspaceAnalyticsData,
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

export async function listScheduledScans(workspaceId: string): Promise<ScheduledWorkspaceScan[]> {
  const { data } = await api.get<ScheduledWorkspaceScan[]>('/scheduled-scans', { params: { workspace_id: workspaceId } });
  return data;
}

export async function createScheduledScan(input: {
  workspace_id: string; api_id: string; name: string; url: string; cadence: 'daily' | 'weekly' | 'interval';
  timezone_name: string; local_time?: string; weekday?: number; interval_minutes?: number;
}): Promise<void> {
  await api.post('/scheduled-scans', input);
}

export async function setScheduledScanEnabled(id: string, enabled: boolean): Promise<void> {
  await api.patch(`/scheduled-scans/${id}`, undefined, { params: { enabled } });
}

export async function runScheduledScanNow(id: string): Promise<{ scan_id: string }> {
  const { data } = await api.post<{ scan_id: string }>(`/scheduled-scans/${id}/run`);
  return data;
}

export async function getScheduledScanExecutions(id: string): Promise<ScheduledScanExecution[]> {
  const { data } = await api.get<ScheduledScanExecution[]>(`/scheduled-scans/${id}/executions`);
  return data;
}

export async function explainFinding(scanId: string, findingId: string): Promise<string> {
  const { data } = await api.post<{ explanation: string }>(`/scans/${scanId}/findings/${findingId}/explain`);
  return data.explanation;
}

export async function getWorkspaceAnalytics(workspaceId: string, filters: { date_from?: string; date_to?: string; severity?: string; scan_status?: string } = {}): Promise<WorkspaceAnalyticsData> {
  const { data } = await api.get<WorkspaceAnalyticsData>(`/workspaces/${workspaceId}/analytics`, { params: filters });
  return data;
}

// Attach only the bearer token. The API verifies its signature and claims;
// client-supplied identity headers are never used as authentication.
api.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch {
    // Continue in guest mode
  }
  return config;
});

// ── Scans ─────────────────────────────────────────────────────────────────────

export async function createScan(
  url: string,
  notes?: string,
  workspaceId?: string | null
): Promise<Scan> {
  const { data } = await api.post<Scan>('/scans', {
    url,
    notes,
    workspace_id: workspaceId || undefined,
  });
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

// ── API Category ──────────────────────────────────────────────────────

export async function getApiCategory(scanId: string): Promise<ApiCategoryResult> {
  const { data } = await api.get<ApiCategoryResult>(`/scans/${scanId}/category`);
  return data;
}

export async function correctApiCategory(
  scanId: string,
  category: string
): Promise<ApiCategoryResult> {
  const { data } = await api.post<ApiCategoryResult>(`/scans/${scanId}/category`, { category });
  return data;
}

export async function listApiCategories(): Promise<string[]> {
  const { data } = await api.get<{ categories: string[] }>('/categories');
  return data.categories;
}

// ── Similar APIs & Alternatives ───────────────────────────────────────────────

export async function getAlternatives(scanId: string, limit = 10): Promise<AlternativesResponse> {
  const { data } = await api.get<AlternativesResponse>(`/scans/${scanId}/alternatives`, {
    params: { limit },
  });
  return data;
}

export async function discoverAlternatives(scanId: string, limit = 10): Promise<AlternativesResponse> {
  const { data } = await api.post<AlternativesResponse>(`/scans/${scanId}/alternatives/discover`, null, {
    params: { limit },
  });
  return data;
}

// ── Alternative API Real Security Scans (Step 3) ─────────────────────────────

export async function scanAlternativeApis(
  scanId: string,
  alternativeIds: string[]
): Promise<AlternativeScansListResponse> {
  const { data } = await api.post<AlternativeScansListResponse>(
    `/scans/${scanId}/alternatives/scan`,
    { alternative_ids: alternativeIds }
  );
  return data;
}

export async function getAlternativeScans(
  scanId: string
): Promise<AlternativeScansListResponse> {
  const { data } = await api.get<AlternativeScansListResponse>(
    `/scans/${scanId}/alternatives/scans`
  );
  return data;
}

export async function getAlternativeScanDetail(
  scanId: string,
  alternativeId: string
): Promise<AlternativeScanResult> {
  const { data } = await api.get<AlternativeScanResult>(
    `/scans/${scanId}/alternatives/scans/${alternativeId}`
  );
  return data;
}

// ── Intelligent API Comparison & Recommendations (Step 4) ───────────────────────

export async function getApiComparison(scanId: string): Promise<ApiComparisonResponse> {
  const { data } = await api.get<ApiComparisonResponse>(`/scans/${scanId}/comparison`);
  return data;
}

export async function recalculateApiComparison(
  scanId: string,
  customWeights?: ComparisonRecalculateRequest
): Promise<ApiComparisonResponse> {
  const { data } = await api.post<ApiComparisonResponse>(
    `/scans/${scanId}/comparison/recalculate`,
    customWeights || null
  );
  return data;
}

export async function getScanHistory(
  limit = 20,
  offset = 0,
  scope: 'my' | 'workspace' = 'workspace',
  workspaceId?: string | null
): Promise<HistoryResponse> {
  const { data } = await api.get<HistoryResponse>('/scans/history', {
    params: { limit, offset, scope, workspace_id: workspaceId || undefined },
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

  // Store spec analysis and reference in Supabase
  persistSpecToSupabase(null, url, data).catch((err) =>
    console.warn('Supabase spec persistence error:', err)
  );

  return data;
}

export async function analyzeSpecFile(file: File): Promise<SpecAnalysis> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<SpecAnalysis>('/specifications/analyze', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  // Upload spec file to Supabase Storage & store record in Supabase spec_uploads
  persistSpecToSupabase(file, null, data).catch((err) =>
    console.warn('Supabase spec persistence error:', err)
  );

  return data;
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthStatus> {
  const { data } = await api.get<HealthStatus>('/health');
  return data;
}

// ── Operation Scan ────────────────────────────────────────────────────────────

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
