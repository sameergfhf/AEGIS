// src/types/index.ts — All application-wide TypeScript types

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type FindingStatus = 'pass' | 'fail' | 'warning' | 'inconclusive';
export type TestStatus = 'pass' | 'fail' | 'warning' | 'inconclusive';

export interface Scan {
  id: string;
  url: string;
  hostname: string;
  status: ScanStatus;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  assessment_score?: number;
  earned_points?: number;
  assessed_points?: number;
  assessment_coverage?: number;
  passed_checks: number;
  failed_checks: number;
  warning_checks: number;
  inconclusive_checks: number;
  highest_severity?: Severity;
  error_message?: string;
  result_json?: string;
  user_id?: string;
  user_email?: string;
  workspace_id?: string | null;
}

export interface Finding {
  id: string;
  scan_id: string;
  title: string;
  category: string;
  severity: Severity;
  confidence: string;
  status: FindingStatus;
  evidence?: string;
  description?: string;
  why_it_matters?: string;
  remediation?: string;
  rule_reference?: string;
  created_at: string;
}

export interface TestResult {
  name: string;
  status: TestStatus;
  earned_points: number;
  max_points: number;
  findings: Array<Record<string, unknown>>;
  evidence: Record<string, unknown>;
  recommendations: string[];
}

export interface ScoreResult {
  assessment_score?: number;
  earned_points: number;
  assessed_points: number;
  assessment_coverage: number;
  passed_checks: number;
  failed_checks: number;
  warning_checks: number;
  inconclusive_checks: number;
  highest_severity?: Severity;
  test_results: Record<string, TestResult>;
}

// Visualizations
export interface LatencyPoint {
  request_number: number;
  response_time_ms?: number;
  status_code?: number;
  timed_out: boolean;
  error?: string;
}

export interface LatencyStats {
  avg_ms?: number;
  min_ms?: number;
  max_ms?: number;
  failed_requests: number;
  samples: LatencyPoint[];
}

export interface FlowNodeData {
  url?: string;
  stage?: string;
  stage_status?: 'completed' | 'failed' | 'warning' | 'skipped' | 'inconclusive' | 'running';
  description?: string;
  status?: string;
  resolved_ip?: string;
  status_code?: number;
  redirect_count?: number;
  icon?: string;
  // Security check fields
  check_type?: string;
  check_label?: string;
  finding_count?: number;
  findings_fail?: number;
  findings_warning?: number;
  findings_pass?: number;
  earned_points?: number;
  max_points?: number;
  provider?: string;
  // Rich detail support
  detail_items?: string[];
  method?: string;
  content_type?: string;
  response_size_bytes?: number;
  duration_ms?: number;
  error?: string;
  reason?: string;
  destination?: string;
  [key: string]: unknown;
}

export interface FlowNode {
  id: string;
  type: string;
  label: string;
  data: FlowNodeData;
  position: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated: boolean;
  style: Record<string, unknown>;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FindingsBySeverity {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}

export interface Visualizations {
  latency: LatencyStats;
  flow: FlowGraph;
  findings_by_severity: FindingsBySeverity;
}

// Scan history
export interface ScanSummary {
  id: string;
  url: string;
  hostname: string;
  status: ScanStatus;
  started_at: string;
  completed_at?: string;
  assessment_score?: number;
  assessment_coverage?: number;
  passed_checks: number;
  failed_checks: number;
  highest_severity?: Severity;
  user_id?: string;
  user_email?: string;
  workspace_id?: string | null;
}

export type WorkspaceRole = 'owner' | 'admin' | 'security_analyst' | 'developer' | 'auditor' | 'viewer' | 'member';
export type WorkspaceAssignableRole = Exclude<WorkspaceRole, 'owner'>;

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  role?: WorkspaceRole;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  email: string;
  role: WorkspaceRole;
  status: 'active' | 'invited' | 'declined';
  invited_by?: string | null;
  joined_at?: string | null;
  created_at: string;
}

export interface WorkspaceInvitation extends WorkspaceMember {
  workspace_name?: string;
  workspace_description?: string | null;
  inviter_email?: string | null;
}

export type WorkspaceEnvironment = 'development' | 'staging' | 'production' | 'custom';

export interface WorkspaceProject {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description?: string | null;
  business_owner_id?: string | null;
  technical_owner_id?: string | null;
  created_by: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface WorkspaceApi {
  id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  base_url: string;
  provider?: string | null;
  category?: string | null;
  environment: WorkspaceEnvironment;
  custom_environment?: string | null;
  owner_id?: string | null;
  created_by: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export type WorkspacePolicyRule =
  | 'https_required' | 'minimum_tls' | 'hsts_required' | 'csp_required'
  | 'content_type_options_required' | 'minimum_score' | 'minimum_coverage'
  | 'maximum_critical_findings' | 'certificate_expiry_days' | 'scan_frequency_days';

export interface WorkspaceSecurityPolicy {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  rule_type: WorkspacePolicyRule;
  configuration: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  alert_on_violation: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceNotification {
  id: string;
  workspace_id: string;
  user_id: string;
  event_type: 'finding.created' | 'policy.violation' | 'scan.failed';
  title: string;
  body: string;
  resource_id?: string | null;
  created_at: string;
  read_at?: string | null;
}

export interface WorkspacePolicyEvaluation {
  id: string; workspace_id: string; policy_id: string; scan_id: string;
  outcome: 'compliant' | 'non_compliant' | 'not_applicable' | 'inconclusive';
  reason: string; evidence: Record<string, unknown>; evaluated_at: string;
}

export interface WorkspaceAuditEvent {
  id: string; workspace_id: string; actor_id?: string | null; action: string;
  resource_type: string; resource_id?: string | null; occurred_at: string;
  correlation_id?: string | null; metadata: Record<string, unknown>;
}

export interface ScheduledWorkspaceScan {
  id: string; api_id: string; name: string; url: string; cadence: 'daily' | 'weekly' | 'interval';
  timezone: string; local_time: string; weekday?: number | null; interval_minutes?: number | null;
  enabled: boolean; next_run_at: string; last_run_at?: string | null;
}

export interface ScheduledScanExecution {
  id: string; scan_id: string; scheduled_for: string; status: string;
  attempts: number; error?: string | null; started_at: string; finished_at?: string | null;
}

export interface WorkspaceAnalyticsData {
  apis: { total: number; by_category: Record<string, number>; by_environment: Record<string, number> };
  scans: { total: number; completed: number; failed: number; average_score: number | null; average_coverage: number | null; trend: Array<{ date: string; average_score: number | null; average_coverage: number | null; scans: number }> };
  findings: { total: number; by_severity: Record<string, number> };
  incidents: { open: number; overdue: number; mean_time_to_remediate_hours: number | null };
  policy: { evaluations: number; compliant: number; non_compliant: number; inconclusive: number; compliance_rate: number | null };
  automation: { scheduled_runs: number; success_rate: number | null };
  risk_acceptances: { total: number; approved: number; pending: number };
  data_limitations: string[];
}

export interface WorkspaceIncident {
  id: string;
  workspace_id: string;
  project_id?: string | null;
  api_id?: string | null;
  related_scan_id?: string | null;
  finding_ids: string[];
  deduplication_key?: string | null;
  title: string;
  description?: string | null;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'acknowledged' | 'investigating' | 'remediation_in_progress' | 'resolved' | 'closed' | 'accepted_risk';
  assigned_to?: string | null;
  created_by: string;
  due_at?: string | null;
  resolution_notes?: string | null;
  evidence: Record<string, unknown>;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceApproval {
  id: string;
  workspace_id: string;
  request_type: 'risk_acceptance' | 'policy_exception' | 'incident_closure' | 'baseline_change' | 'integration_configuration';
  resource_id?: string | null;
  requester_id: string;
  requested_action: string;
  business_justification: string;
  risk_description: string;
  supporting_evidence: Record<string, unknown>;
  approver_id?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  decision_notes?: string | null;
  expires_at?: string | null;
  decided_by?: string | null;
  created_at: string;
  decided_at?: string | null;
}

export interface WorkspaceMessage {
  id: string;
  workspace_id: string;
  sender_id: string;
  sender_email: string;
  sender_name?: string | null;
  content: string;
  created_at: string;
}

export interface WorkspaceTask {
  id: string;
  workspace_id: string;
  title: string;
  description?: string | null;
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigned_to?: string | null;
  assigned_email?: string | null;
  created_by: string;
  due_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HistoryResponse {
  scans: ScanSummary[];
  total: number;
  my_total?: number;
  workspace_total?: number;
}

// OpenAPI Spec
export interface EndpointInfo {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  parameters: Array<Record<string, unknown>>;
  request_body?: Record<string, unknown>;
  responses: Record<string, unknown>;
  auth_schemes: string[];
  deprecated: boolean;
}

export interface SpecAnalysis {
  spec_id: string;
  title?: string;
  version?: string;
  base_url?: string;
  endpoints: EndpointInfo[];
  auth_schemes: string[];
  total_endpoints: number;
  deprecated_count: number;
}

// Comparison
export interface ComparisonFindingChange {
  title: string;
  category: string;
  status: 'new' | 'not_detected' | 'severity_changed' | 'unchanged';
  severity_before?: Severity;
  severity_after?: Severity;
}

export interface ComparisonResult {
  scan_a: ScanSummary;
  scan_b: ScanSummary;
  score_change?: number;
  coverage_change?: number;
  latency_change_ms?: number;
  finding_changes: ComparisonFindingChange[];
  note: string;
}

export interface ApiCategoryResult {
  category: string;
  confidence: number;       // 0.0 – 1.0
  reason: string;
  detection_method: string;
  requires_user_confirmation: boolean;
  matched_signals: string[];
  user_category?: string | null;
}

export interface AlternativeApi {
  id: string;
  provider_name: string;
  api_name: string;
  category: string;
  description: string;
  website_url?: string | null;
  documentation_url?: string | null;
  api_endpoint_url?: string | null;
  endpoint_status?: 'verified' | 'endpoint_unverified';
  main_functionality: string;
  supported_features: string[];
  authentication_methods: string[];
  pricing_model?: string | null;
  pricing_details?: string | null;
  pricing_url?: string | null;
  openapi_spec_url?: string | null;
  compatibility_notes?: string | null;
  source_urls: string[];
  verification_status: 'verified' | 'community' | 'unverified';
  last_updated?: string | null;
  relevance_score: number;
  relevance_reason: string;
  discovery_source?: 'local_catalogue' | 'live_directory' | 'official_documentation' | 'combined';
  metadata_verification_status?: string;
  relevance_confidence?: number | null;
  // Step 3 Real Security Scan fields
  scan_status?: 'completed' | 'failed' | 'not_tested_auth_required' | 'endpoint_unverified' | null;
  scan_score?: number | null;
  scan_coverage?: number | null;
  highest_severity?: string | null;
}

export interface AlternativesResponse {
  scan_id: string;
  target_url: string;
  target_hostname: string;
  category: string;
  user_category?: string | null;
  total_found: number;
  alternatives: AlternativeApi[];
  discovered_at?: string | null;
  source_summary: string;
  is_cached?: boolean;
  discovery_source?: 'local_catalogue' | 'live_directory' | 'official_documentation' | 'combined';
  cache_status?: string;
  retrieved_at?: string | null;
  warnings?: string[];
}

export interface AlternativeScanFinding {
  check?: string;
  severity?: string | null;
  status: string;
  detail?: string;
  why_it_matters?: string;
  remediation?: string;
  module?: string;
  module_name?: string;
  evidence?: unknown;
  rule?: string;
}

export interface AlternativeScanResult {
  alternative_id: string;
  provider_name: string;
  api_name: string;
  endpoint_url: string;
  endpoint_status: 'verified' | 'endpoint_unverified';
  status: 'completed' | 'failed' | 'not_tested_auth_required' | 'endpoint_unverified';
  status_message: string;
  assessment_score?: number | null;
  assessment_coverage: number;
  earned_points: number;
  assessed_points: number;
  passed_checks: number;
  failed_checks: number;
  warning_checks: number;
  inconclusive_checks: number;
  highest_severity?: string | null;
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  findings_count_by_severity: Record<string, number>;
  test_results: Record<string, TestResult>;
  findings: AlternativeScanFinding[];
  security_assessment_verified: boolean;
  auth_required_noted: boolean;
}

export interface AlternativeScanRequest {
  alternative_ids: string[];
}

export interface AlternativeScansListResponse {
  scan_id: string;
  total_scanned: number;
  results: AlternativeScanResult[];
}

export interface HealthStatus {
  status: string;
  version: string;
  database: string;
  virustotal: string;
}

// ── Operation Scan ────────────────────────────────────────────────────────────

export interface OperationScanRequest {
  spec_id: string;
  path: string;
  method: string;
  base_url: string;
  path_params?: Record<string, string>;
  query_params?: Record<string, string>;
  request_body?: Record<string, unknown> | null;
  auth_header?: string | null;
  confirm_destructive?: boolean;
  notes?: string;
  workspace_id?: string | null;
}

/** Embedded in result_json when scan originated from the Spec Analyzer */
export interface OperationContext {
  from_spec: true;
  spec_id: string;
  spec_title?: string;
  spec_version?: string;
  path: string;
  method: string;
  resolved_path: string;
  summary?: string;
  description?: string;
  parameters: Array<Record<string, unknown>>;
  request_body_schema?: Record<string, unknown>;
  responses: Record<string, { description: string }>;
  auth_schemes: string[];
  deprecated: boolean;
  path_params_supplied: string[];
  query_params_supplied: string[];
  has_request_body: boolean;
  has_auth: boolean;
}


// ── Step 4 Intelligent API Comparison & Recommendations ───────────────────────

export interface BaselineApi {
  name: string;
  url: string;
  hostname: string;
  category: string;
  assessment_score?: number | null;
  assessment_coverage: number;
  earned_points: number;
  assessed_points: number;
  passed_checks: number;
  failed_checks: number;
  warning_checks: number;
  inconclusive_checks: number;
  highest_severity?: string | null;
  findings_count_by_severity: Record<string, number>;
  vector_scores: Record<string, { name: string; earned: number; max: number; status: string }>;
}

export interface ComparedAlternative {
  id: string;
  provider_name: string;
  api_name: string;
  category: string;
  api_endpoint_url?: string | null;
  endpoint_status: string;
  scan_status: 'completed' | 'not_tested_auth_required' | 'not_assessed' | 'failed' | 'endpoint_unverified';
  assessment_score?: number | null;
  assessment_coverage: number;
  score_difference?: number | null;
  coverage_difference?: number | null;
  coverage_status: 'sufficient' | 'provisional' | 'insufficient' | 'not_assessed';
  highest_severity?: string | null;
  findings_count_by_severity: Record<string, number>;
  vector_scores: Record<string, { name: string; earned: number; max: number; status: string }>;
  vector_differences: Record<string, number | null>;
  relevance_score: number;
  compatibility_level: 'high' | 'partial' | 'low' | 'unknown';
  compatibility_reason: string;
  supported_features: string[];
  authentication_methods: string[];
  pricing_model?: string | null;
  pricing_details?: string | null;
  pricing_url?: string | null;
  pricing_status: 'verified' | 'unverified';
  recommendation_label: string;
  composite_score?: number | null;
  is_security_eligible: boolean;
  eligibility_reasons: string[];
  strengths: string[];
  weaknesses: string[];
  summary_explanation: string;
  warnings: string[];
  verification_checklist: string[];
}

export interface ComparisonSummary {
  best_match_id?: string | null;
  best_match_name?: string | null;
  headline: string;
  overall_conclusion: string;
  total_alternatives_evaluated: number;
  total_scanned: number;
  total_unscanned: number;
  coverage_threshold_policy: string;
  weights_applied: Record<string, number>;
}

export interface ApiComparisonResponse {
  scan_id: string;
  generated_at: string;
  baseline: BaselineApi;
  summary: ComparisonSummary;
  alternatives: ComparedAlternative[];
  comparison_table: Array<Record<string, string>>;
  chart_data: {
    scores_bar: Array<{ name: string; score: number | null; coverage: number; isBaseline: boolean; provider: string; status: string }>;
    vectors_bar: Array<Record<string, unknown>>;
    findings_bar: Array<{ name: string; critical: number; high: number; medium: number; low: number }>;
  };
}

export interface ComparisonRecalculateRequest {
  security_weight?: number;
  relevance_weight?: number;
  compatibility_weight?: number;
  pricing_weight?: number;
  completeness_weight?: number;
}
