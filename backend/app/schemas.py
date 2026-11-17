"""
app/schemas.py — Pydantic request / response models.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator


# ── Request Schemas ─────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    url: str = Field(..., description="The API URL to scan.", min_length=8, max_length=2048)
    notes: Optional[str] = Field(None, max_length=512)
    workspace_id: Optional[str] = Field(None, description="Optional workspace/team UUID for the scan")

    @field_validator("url")
    @classmethod
    def url_must_have_scheme(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


# ── Finding Schemas ─────────────────────────────────────────────────────────────

class FindingOut(BaseModel):
    id: str
    scan_id: str
    title: str
    category: str
    severity: str
    confidence: str
    status: str
    evidence: Optional[str] = None
    description: Optional[str] = None
    why_it_matters: Optional[str] = None
    remediation: Optional[str] = None
    rule_reference: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Score Schemas ───────────────────────────────────────────────────────────────

class TestResult(BaseModel):
    __test__ = False  # Prevent pytest from treating this schema as a test suite
    name: str
    status: str           # pass | fail | warning | inconclusive
    earned_points: float
    max_points: float
    findings: List[Dict[str, Any]] = Field(default_factory=list)
    evidence: Dict[str, Any] = Field(default_factory=dict)
    recommendations: List[str] = Field(default_factory=list)


class ScoreResult(BaseModel):
    assessment_score: Optional[float]  # null if no tests assessed
    earned_points: float
    assessed_points: float
    assessment_coverage: float         # 0-100
    passed_checks: int
    failed_checks: int
    warning_checks: int
    inconclusive_checks: int
    highest_severity: Optional[str]
    test_results: Dict[str, TestResult]


# ── Scan Schemas ────────────────────────────────────────────────────────────────

class ScanOut(BaseModel):
    id: str
    url: str
    hostname: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[float] = None

    assessment_score: Optional[float] = None
    earned_points: Optional[float] = None
    assessed_points: Optional[float] = None
    assessment_coverage: Optional[float] = None

    passed_checks: int = 0
    failed_checks: int = 0
    warning_checks: int = 0
    inconclusive_checks: int = 0
    highest_severity: Optional[str] = None

    error_message: Optional[str] = None
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    workspace_id: Optional[str] = None

    model_config = {"from_attributes": True}


class ScanDetailOut(ScanOut):
    result_json: Optional[str] = None  # Full sanitized JSON


# ── Visualization Schemas ───────────────────────────────────────────────────────

class LatencyPoint(BaseModel):
    request_number: int
    response_time_ms: Optional[float]
    status_code: Optional[int]
    timed_out: bool = False
    error: Optional[str] = None


class LatencyStats(BaseModel):
    avg_ms: Optional[float]
    min_ms: Optional[float]
    max_ms: Optional[float]
    failed_requests: int
    samples: List[LatencyPoint]


class FlowNode(BaseModel):
    id: str
    type: str
    label: str
    data: Dict[str, Any] = Field(default_factory=dict)
    position: Dict[str, float] = Field(default_factory=dict)


class FlowEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None
    animated: bool = False
    style: Dict[str, Any] = Field(default_factory=dict)


class FlowGraph(BaseModel):
    nodes: List[FlowNode]
    edges: List[FlowEdge]


class FindingsBySeverity(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    informational: int = 0


class VisualizationsOut(BaseModel):
    latency: LatencyStats
    flow: FlowGraph
    findings_by_severity: FindingsBySeverity


# ── History and Comparison ─────────────────────────────────────────────────────

class ScanSummary(BaseModel):
    id: str
    url: str
    hostname: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    assessment_score: Optional[float] = None
    assessment_coverage: Optional[float] = None
    passed_checks: int = 0
    failed_checks: int = 0
    highest_severity: Optional[str] = None
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    workspace_id: Optional[str] = None

    model_config = {"from_attributes": True}


class HistoryOut(BaseModel):
    scans: List[ScanSummary]
    total: int
    my_total: int = 0
    workspace_total: int = 0


class ComparisonRequest(BaseModel):
    scan_id_a: str
    scan_id_b: str


class ComparisonFindingChange(BaseModel):
    title: str
    category: str
    status: str  # new | resolved | severity_changed | unchanged
    severity_before: Optional[str] = None
    severity_after: Optional[str] = None


class ComparisonOut(BaseModel):
    scan_a: ScanSummary
    scan_b: ScanSummary
    score_change: Optional[float]
    coverage_change: Optional[float]
    latency_change_ms: Optional[float]
    finding_changes: List[ComparisonFindingChange]
    note: str = (
        "A finding not detected in the later scan was not observed during that assessment. "
        "This does not confirm it has been remediated."
    )


# ── OpenAPI Spec Schemas ────────────────────────────────────────────────────────

class SpecAnalyzeRequest(BaseModel):
    url: Optional[str] = Field(None, description="URL of an OpenAPI spec to fetch")
    # File upload handled separately via multipart


class EndpointInfo(BaseModel):
    path: str
    method: str
    summary: Optional[str] = None
    description: Optional[str] = None
    parameters: List[Dict[str, Any]] = Field(default_factory=list)
    request_body: Optional[Dict[str, Any]] = None
    responses: Dict[str, Any] = Field(default_factory=dict)
    auth_schemes: List[str] = Field(default_factory=list)
    deprecated: bool = False


class SpecAnalysisOut(BaseModel):
    spec_id: str
    title: Optional[str] = None
    version: Optional[str] = None
    base_url: Optional[str] = None
    endpoints: List[EndpointInfo]
    auth_schemes: List[str]
    total_endpoints: int
    deprecated_count: int


# ── API Category ────────────────────────────────────────────────────────────────

class ApiCategoryResult(BaseModel):
    """Classification result for an API scan."""
    category: str
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score 0.0–1.0")
    reason: str
    detection_method: str
    requires_user_confirmation: bool
    matched_signals: List[str] = Field(default_factory=list)
    # Set when the user manually corrects the category
    user_category: Optional[str] = None


class ApiCategoryCorrection(BaseModel):
    """Request body to manually correct the detected API category."""
    category: str = Field(..., min_length=1, max_length=128)


# ── Alternative APIs ────────────────────────────────────────────────────────────

class AlternativeApiOut(BaseModel):
    """Information for a discovered alternative API."""
    id: str
    provider_name: str
    api_name: str
    category: str
    description: str
    website_url: Optional[str] = None
    documentation_url: Optional[str] = None
    api_endpoint_url: Optional[str] = None
    endpoint_status: str = "verified"
    main_functionality: str
    supported_features: List[str] = Field(default_factory=list)
    authentication_methods: List[str] = Field(default_factory=list)
    pricing_model: Optional[str] = None
    pricing_details: Optional[str] = None
    pricing_url: Optional[str] = None
    openapi_spec_url: Optional[str] = None
    compatibility_notes: Optional[str] = None
    source_urls: List[str] = Field(default_factory=list)
    verification_status: str = "verified"
    last_updated: Optional[str] = None
    relevance_score: float = Field(..., ge=0.0, le=1.0, description="Relevance score (0.0 to 1.0) — NOT a security score")
    relevance_reason: str
    discovery_source: str = "local_catalogue"
    metadata_verification_status: str = "verified"
    relevance_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    # Real security scanning fields (populated after Step 3 scans)
    scan_status: Optional[str] = None
    scan_score: Optional[float] = None
    scan_coverage: Optional[float] = None
    highest_severity: Optional[str] = None


class AlternativeScanRequest(BaseModel):
    """Request payload to initiate real security scanning for selected alternatives."""
    alternative_ids: List[str] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="List of alternative provider IDs to assess."
    )


class AlternativeScanResultOut(BaseModel):
    """Real security assessment result for a single alternative API."""
    alternative_id: str
    provider_name: str
    api_name: str
    endpoint_url: str
    endpoint_status: str = "verified"
    status: str  # completed | failed | not_tested_auth_required | endpoint_unverified
    status_message: str
    assessment_score: Optional[float] = None
    assessment_coverage: float = 0.0
    earned_points: float = 0.0
    assessed_points: float = 0.0
    passed_checks: int = 0
    failed_checks: int = 0
    warning_checks: int = 0
    inconclusive_checks: int = 0
    highest_severity: Optional[str] = None
    started_at: str
    completed_at: Optional[str] = None
    duration_ms: Optional[float] = None
    findings_count_by_severity: Dict[str, int] = Field(default_factory=dict)
    test_results: Dict[str, Any] = Field(default_factory=dict)
    findings: List[Dict[str, Any]] = Field(default_factory=list)
    security_assessment_verified: bool = True
    auth_required_noted: bool = False


class AlternativeScansListResponse(BaseModel):
    """List of all real security assessments performed on alternatives for this scan."""
    scan_id: str
    total_scanned: int
    results: List[AlternativeScanResultOut] = Field(default_factory=list)


class AlternativesResponse(BaseModel):
    """Response payload for alternative API discovery."""
    scan_id: str
    target_url: str
    target_hostname: str
    category: str
    user_category: Optional[str] = None
    total_found: int
    alternatives: List[AlternativeApiOut] = Field(default_factory=list)
    discovered_at: Optional[str] = None
    discovery_source: str = "local_catalogue"
    cache_status: str = "unknown"
    retrieved_at: Optional[str] = None
    source_summary: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)
    is_cached: bool = False


# ── Intelligent API Comparison & Recommendations (Step 4) ──────────────────────

class BaselineApiOut(BaseModel):
    """The original scanned API used as comparison baseline."""
    name: str
    url: str
    hostname: str
    category: str
    assessment_score: Optional[float] = None
    assessment_coverage: float = 0.0
    earned_points: float = 0.0
    assessed_points: float = 0.0
    passed_checks: int = 0
    failed_checks: int = 0
    warning_checks: int = 0
    inconclusive_checks: int = 0
    highest_severity: Optional[str] = None
    findings_count_by_severity: Dict[str, int] = Field(default_factory=dict)
    vector_scores: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class ComparedAlternativeOut(BaseModel):
    """Evaluation, comparison metrics, and recommendation for an alternative."""
    id: str
    provider_name: str
    api_name: str
    category: str
    api_endpoint_url: Optional[str] = None
    endpoint_status: str = "verified"
    scan_status: str  # completed | not_tested_auth_required | not_assessed | failed | endpoint_unverified

    # Security Comparison (actual scores only)
    assessment_score: Optional[float] = None
    assessment_coverage: float = 0.0
    score_difference: Optional[float] = None  # alt - baseline (+8.0 means 8 points higher)
    coverage_difference: Optional[float] = None
    coverage_status: str = "not_assessed"  # sufficient (>=80%) | provisional (50-79%) | insufficient (<50%) | not_assessed

    # Severity & Vectors
    highest_severity: Optional[str] = None
    findings_count_by_severity: Dict[str, int] = Field(default_factory=dict)
    vector_scores: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    vector_differences: Dict[str, Optional[float]] = Field(default_factory=dict)

    # Functional Compatibility
    relevance_score: float = 0.0
    compatibility_level: str = "unknown"  # high | partial | low | unknown
    compatibility_reason: str = ""
    supported_features: List[str] = Field(default_factory=list)
    authentication_methods: List[str] = Field(default_factory=list)

    # Pricing Information (verified sources only)
    pricing_model: Optional[str] = None
    pricing_details: Optional[str] = None
    pricing_url: Optional[str] = None
    pricing_status: str = "unverified"  # verified | unverified

    # Transparent Recommendation Engine Results
    recommendation_label: str  # Best Overall Match | Higher Security Score | Best Functional Match | Lower Verified Cost | Provisional Candidate | Insufficient Evidence | Not Recommended
    composite_score: Optional[float] = None
    is_security_eligible: bool = False
    eligibility_reasons: List[str] = Field(default_factory=list)
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    summary_explanation: str = ""
    warnings: List[str] = Field(default_factory=list)
    verification_checklist: List[str] = Field(default_factory=list)


class ComparisonSummaryOut(BaseModel):
    """Overall synthesis and top recommendation conclusion."""
    best_match_id: Optional[str] = None
    best_match_name: Optional[str] = None
    headline: str
    overall_conclusion: str
    total_alternatives_evaluated: int = 0
    total_scanned: int = 0
    total_unscanned: int = 0
    coverage_threshold_policy: str = ">=80% Strong, 50-79% Provisional, <50% Insufficient"
    weights_applied: Dict[str, float] = Field(default_factory=dict)


class ApiComparisonResponse(BaseModel):
    """Structured response for intelligent comparison and recommendations."""
    scan_id: str
    generated_at: str
    baseline: BaselineApiOut
    summary: ComparisonSummaryOut
    alternatives: List[ComparedAlternativeOut] = Field(default_factory=list)
    comparison_table: List[Dict[str, Any]] = Field(default_factory=list)
    chart_data: Dict[str, Any] = Field(default_factory=dict)


class ComparisonRecalculateRequest(BaseModel):
    """Optional custom weights for comparison recalculation."""
    security_weight: Optional[float] = Field(None, ge=0.0, le=1.0)
    relevance_weight: Optional[float] = Field(None, ge=0.0, le=1.0)
    compatibility_weight: Optional[float] = Field(None, ge=0.0, le=1.0)
    pricing_weight: Optional[float] = Field(None, ge=0.0, le=1.0)
    completeness_weight: Optional[float] = Field(None, ge=0.0, le=1.0)



# ── Health ──────────────────────────────────────────────────────────────────────

class HealthOut(BaseModel):
    status: str
    version: str
    database: str
    virustotal: str
    google_safe_browsing: Optional[str] = "not_configured"


# ── Operation Scan ──────────────────────────────────────────────────────────────

class OperationScanRequest(BaseModel):
    """
    Request to scan a single OpenAPI operation that was imported via the
    Spec Analyzer.  The backend validates the (method, path) pair against
    the cached specification before dispatching the scan.
    """
    spec_id: str = Field(..., description="ID returned by POST /api/specifications/analyze")
    path: str = Field(..., description="Exact path from the spec, e.g. /pet/{petId}", min_length=1, max_length=1024)
    method: str = Field(..., description="HTTP method, e.g. GET", min_length=1, max_length=16)
    base_url: str = Field(
        ...,
        description="Absolute base URL for the API server, e.g. https://api.example.com",
        min_length=1,
        max_length=2048,
    )

    # User-supplied parameter values
    path_params: Dict[str, str] = Field(default_factory=dict, description="Values for {param} placeholders")
    query_params: Dict[str, str] = Field(default_factory=dict, description="Query string parameters")
    request_body: Optional[Dict[str, Any]] = Field(None, description="JSON request body for POST/PUT/PATCH")

    # Auth — used only for the HTTP request; never stored in the database
    auth_header: Optional[str] = Field(
        None,
        description="Authorization header value (e.g. 'Bearer token'). Not persisted.",
        max_length=4096,
    )

    # Safety gate for mutating methods
    confirm_destructive: bool = Field(
        False,
        description="Must be true to execute POST, PUT, PATCH, or DELETE operations.",
    )

    notes: Optional[str] = Field(None, max_length=512)
    workspace_id: Optional[str] = Field(None, description="Optional workspace/team UUID for the scan")

    @field_validator("method")
    @classmethod
    def method_must_be_valid(cls, v: str) -> str:
        v = v.upper().strip()
        allowed = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
        if v not in allowed:
            raise ValueError(f"Method must be one of {sorted(allowed)}")
        return v

    @field_validator("base_url")
    @classmethod
    def base_url_must_have_scheme(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError(
                f"base_url must be an absolute URL starting with 'http://' or 'https://'. "
                f"Received: '{v[:80]}'. "
                "If your specification lists a relative server URL (e.g. /api/v3), "
                "enter the full base URL including the hostname in the Base URL field."
            )
        return v.rstrip("/")

    @field_validator("path")
    @classmethod
    def path_must_start_with_slash(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith("/"):
            raise ValueError("path must start with /")
        return v
