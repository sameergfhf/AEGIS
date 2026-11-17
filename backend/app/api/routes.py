"""
app/api/routes.py — All FastAPI route definitions.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from pydantic import BaseModel
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import UserContext, get_current_user_optional
from app.config import get_settings
from app.database import get_db
from app.models.finding import Finding
from app.models.scan import Scan
from app.schemas import (
    AlternativeApiOut,
    AlternativesResponse,
    AlternativeScanRequest,
    AlternativeScanResultOut,
    AlternativeScansListResponse,
    ApiComparisonResponse,
    ComparisonRecalculateRequest,
    ApiCategoryCorrection,
    ApiCategoryResult,
    ComparisonRequest,
    FindingOut,
    HealthOut,
    HistoryOut,
    OperationScanRequest,
    ScanDetailOut,
    ScanOut,
    ScanRequest,
    SpecAnalyzeRequest,
    SpecAnalysisOut,
    VisualizationsOut,
)
from app.security.url_validation import URLValidationError, resolve_and_validate
from app.security.workspace_authorization import (
    Permission,
    get_authorized_scan,
    require_workspace_permission,
)
from app.services import history_service, openapi_service, operation_scan_service, report_service, scan_service
from app.services.ai_security_service import AIUnavailable, explain_finding
from app.services.api_category_service import (
    ALL_CATEGORIES,
    classify_api_from_result_json,
    validate_manual_category,
)
from app.services.alternative_discovery_service import discover_alternatives
from app.services.visualization_service import (
    build_flow_graph,
    collect_latency_samples,
    count_findings_by_severity,
)
from app.schemas import LatencyStats, FlowGraph, FindingsBySeverity

router = APIRouter()
settings = get_settings()


class AIExplanationOut(BaseModel):
    explanation: str
    generated: bool = True
    source: str = "configured AI provider using redacted AEGIS finding evidence"


# ── Health ──────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthOut, tags=["System"])
async def health_check(db: AsyncSession = Depends(get_db)):
    db_status = "ok"
    try:
        await db.execute(select(Scan).limit(1))
    except Exception:
        db_status = "error"

    s = get_settings()
    return HealthOut(
        status="ok",
        version="1.0.0",
        database=db_status,
        virustotal="configured" if s.virustotal_enabled else "not_configured",
        google_safe_browsing="configured" if s.safe_browsing_enabled else "not_configured",
    )


# ── Scans ───────────────────────────────────────────────────────────────────────

@router.post("/scans", response_model=ScanOut, status_code=status.HTTP_202_ACCEPTED, tags=["Scans"])
async def create_scan(
    request: ScanRequest,
    background_tasks: BackgroundTasks,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a URL for scanning. Returns immediately with a scan ID.
    Poll GET /api/scans/{scan_id} to check status.
    """
    try:
        validated_url, resolved_ip = resolve_and_validate(request.url)
    except URLValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    parsed = urlparse(validated_url)
    hostname = parsed.hostname or validated_url

    if request.workspace_id:
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in before creating a workspace scan.")
        await require_workspace_permission(request.workspace_id, user, Permission.RUN_SCAN)

    scan = Scan(
        id=str(uuid.uuid4()),
        url=validated_url,
        hostname=hostname,
        status="pending",
        user_id=user.id if user else None,
        user_email=user.email if user else None,
        workspace_id=request.workspace_id,
    )
    async with db.begin():
        db.add(scan)

    # Run scan in background
    background_tasks.add_task(scan_service.run_scan_in_new_session, scan.id, validated_url)

    return ScanOut.model_validate(scan)


@router.post("/scans/operation", response_model=ScanOut, status_code=status.HTTP_202_ACCEPTED, tags=["Scans"])
async def create_operation_scan(
    request: OperationScanRequest,
    background_tasks: BackgroundTasks,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Scan a single OpenAPI operation imported from the Spec Analyzer.

    The server validates that the submitted (spec_id, method, path) exists in
    the previously cached specification before building the target URL.  The
    final URL is also checked against SSRF protections.  Destructive methods
    (POST, PUT, PATCH, DELETE) require confirm_destructive=true.

    The Authorization header (auth_header) is forwarded to the target only and
    is never stored in the database or included in logs.
    """
    if request.workspace_id:
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in before creating a workspace scan.")
        await require_workspace_permission(request.workspace_id, user, Permission.RUN_SCAN)

    try:
        scan_id, validated_url, scan_kwargs = await operation_scan_service.create_operation_scan(
            request,
            db,
            user_id=user.id if user else None,
            user_email=user.email if user else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Dispatch scan pipeline in background
    background_tasks.add_task(
        scan_service.run_scan_in_new_session,
        scan_id,
        validated_url,
        **scan_kwargs,
    )

    # Return scan stub — caller polls GET /api/scans/{scan_id}
    from sqlalchemy import select as sa_select
    result = await db.execute(sa_select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=500, detail="Scan record could not be retrieved.")
    return ScanOut.model_validate(scan)


@router.get("/scans/history", response_model=HistoryOut, tags=["Scans"])
async def get_scan_history(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    scope: str = Query(default="workspace", pattern="^(my|workspace)$"),
    workspace_id: Optional[str] = Query(default=None),
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if workspace_id and scope == "workspace":
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in to view workspace scan history.")
        await require_workspace_permission(workspace_id, user, Permission.VIEW)
    return await history_service.list_scans(
        db,
        limit=limit,
        offset=offset,
        scope=scope,
        user_id=user.id if user else None,
        workspace_id=workspace_id,
    )


@router.get("/scans/{scan_id}", response_model=ScanDetailOut, tags=["Scans"])
async def get_scan(
    scan_id: str,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    scan = await get_authorized_scan(scan_id, db, user)
    return ScanDetailOut.model_validate(scan)


@router.post("/scans/{scan_id}/findings/{finding_id}/explain", response_model=AIExplanationOut, tags=["Intelligence"])
async def explain_scan_finding(
    scan_id: str,
    finding_id: str,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to request an AI explanation.")
    scan = await get_authorized_scan(scan_id, db, user)
    result = await db.execute(select(Finding).where(Finding.id == finding_id, Finding.scan_id == scan_id))
    finding = result.scalar_one_or_none()
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found for this scan.")
    try:
        explanation = await explain_finding(
            workspace_id=scan.workspace_id,
            actor_id=user.id,
            scan_id=scan.id,
            finding={
                "title": finding.title, "severity": finding.severity, "status": finding.status,
                "category": finding.category, "evidence": finding.evidence,
                "description": finding.description, "why_it_matters": finding.why_it_matters,
                "remediation": finding.remediation, "rule_reference": finding.rule_reference,
            },
        )
    except AIUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return AIExplanationOut(explanation=explanation)


@router.get("/scans/{scan_id}/findings", response_model=list[FindingOut], tags=["Scans"])
async def get_findings(
    scan_id: str,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    await get_authorized_scan(scan_id, db, user)
    result = await db.execute(select(Finding).where(Finding.scan_id == scan_id))
    findings = result.scalars().all()
    return [FindingOut.model_validate(f) for f in findings]


@router.get("/scans/{scan_id}/visualizations", response_model=VisualizationsOut, tags=["Scans"])
async def get_visualizations(
    scan_id: str,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    scan = await get_authorized_scan(scan_id, db, user)
    if scan.status != "completed":
        raise HTTPException(status_code=409, detail="Scan has not completed yet.")
    if not scan.result_json:
        raise HTTPException(status_code=404, detail="Visualization data not available.")

    try:
        data = json.loads(scan.result_json)
        viz = data.get("visualizations", {})
        latency_data = viz.get("latency", {})
        flow_data = viz.get("flow", {})
        severity_data = viz.get("findings_by_severity", {})
        return VisualizationsOut(
            latency=LatencyStats(**latency_data),
            flow=FlowGraph(**flow_data),
            findings_by_severity=FindingsBySeverity(**severity_data),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not parse visualization data: {exc}")


@router.get("/scans/{scan_id}/report", tags=["Scans"])
async def download_report(
    scan_id: str,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    scan = await get_authorized_scan(scan_id, db, user)
    if scan.status != "completed":
        raise HTTPException(status_code=409, detail="Report is only available for completed scans.")

    try:
        pdf_bytes = report_service.generate_pdf(scan)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {exc}")

    safe_hostname = "".join(c if c.isalnum() or c in "-_." else "_" for c in (scan.hostname or "report"))
    filename = f"api_sentinel_{safe_hostname}_{scan.id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/scans/{scan_id}/compare", tags=["Scans"])
async def compare_scans(
    scan_id: str,
    request: ComparisonRequest,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if scan_id != request.scan_id_a:
        raise HTTPException(status_code=404, detail="Scan not found.")
    await get_authorized_scan(request.scan_id_a, db, user)
    await get_authorized_scan(request.scan_id_b, db, user)
    comparison = await history_service.compare_scans(
        request.scan_id_a, request.scan_id_b, db
    )
    if not comparison:
        raise HTTPException(status_code=404, detail="One or both scans not found.")
    return comparison


# ── API Category ─────────────────────────────────────────────────────────────────

@router.get("/scans/{scan_id}/category", response_model=ApiCategoryResult, tags=["Category"])
async def get_api_category(
    scan_id: str,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the auto-detected (or user-corrected) API category for a completed scan.

    The category is read from result_json['api_category'] which is embedded
    during the scan pipeline.  If not present (e.g. older scans), it is
    computed on-the-fly from the scan URL.
    """
    scan = await get_authorized_scan(scan_id, db, user)
    if scan.status not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail="Scan has not completed yet.")

    # Try embedded category first
    if scan.result_json:
        try:
            data = json.loads(scan.result_json)
            cat_data = data.get("api_category")
            if cat_data:
                return ApiCategoryResult(**cat_data)
        except Exception:
            pass

    # Fallback: classify from URL alone (for older scans or failed embeds)
    cat_result = classify_api_from_result_json(scan.url)
    return ApiCategoryResult(
        category=cat_result.category,
        confidence=cat_result.confidence,
        reason=cat_result.reason,
        detection_method=cat_result.detection_method,
        requires_user_confirmation=cat_result.requires_user_confirmation,
        matched_signals=cat_result.matched_signals,
        user_category=None,
    )


@router.post(
    "/scans/{scan_id}/category",
    response_model=ApiCategoryResult,
    tags=["Category"],
)
async def correct_api_category(
    scan_id: str,
    correction: ApiCategoryCorrection,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Allow the user to manually correct the detected API category.

    The correction is stored in result_json['api_category']['user_category']
    so it persists across page reloads without requiring a database migration.
    """
    scan = await get_authorized_scan(scan_id, db, user, write=True)
    if scan.status != "completed":
        raise HTTPException(status_code=409, detail="Category correction requires a completed scan.")

    # Validate the submitted category
    try:
        validated_cat = validate_manual_category(correction.category)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Read and update result_json
    if not scan.result_json:
        raise HTTPException(status_code=404, detail="Scan result data not available.")

    try:
        data = json.loads(scan.result_json)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not parse scan result data.")

    # Ensure api_category block exists (backfill for older scans)
    if not data.get("api_category"):
        cat_result = classify_api_from_result_json(scan.url)
        data["api_category"] = {
            "category": cat_result.category,
            "confidence": cat_result.confidence,
            "reason": cat_result.reason,
            "detection_method": cat_result.detection_method,
            "requires_user_confirmation": cat_result.requires_user_confirmation,
            "matched_signals": cat_result.matched_signals,
            "user_category": None,
        }

    data["api_category"]["user_category"] = validated_cat

    # Automatically refresh alternatives for the newly selected category
    try:
        new_alts = await discover_alternatives(
            target_url=scan.url,
            target_hostname=scan.hostname,
            category=data["api_category"].get("category", "Unknown / Unclassified"),
            user_category=validated_cat,
            detected_signals=data["api_category"].get("matched_signals", []),
            operation_context=data.get("operation_context"),
            include_live=False,
        )
        new_alts["scan_id"] = scan_id
        data["alternatives"] = new_alts
    except Exception:
        data.pop("alternatives", None)

    # Persist the updated result_json
    scan.result_json = json.dumps(data)
    await db.commit()

    return ApiCategoryResult(**data["api_category"])


@router.get("/categories", tags=["Category"])
async def list_categories():
    """Return all supported API category names for the manual correction dropdown."""
    return {"categories": ALL_CATEGORIES}


# ── Alternative APIs ────────────────────────────────────────────────────────────

@router.get("/scans/{scan_id}/alternatives", response_model=AlternativesResponse, tags=["Alternatives"])
async def get_scan_alternatives(
    scan_id: str,
    limit: int = Query(default=5, ge=1, le=20),
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve or discover similar alternative APIs for a completed scan.

    Reads the category from Step 1 (or user-confirmed override).
    If alternatives were already discovered and stored in result_json,
    returns the cached discovery. Otherwise, performs discovery.
    """
    scan = await get_authorized_scan(scan_id, db, user)
    if scan.status not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail="Scan has not completed yet.")

    data: dict = {}
    if scan.result_json:
        try:
            data = json.loads(scan.result_json)
        except Exception:
            data = {}

    # Check if cached alternatives exist
    cached_alt = data.get("alternatives")
    if cached_alt and isinstance(cached_alt, dict) and cached_alt.get("alternatives"):
        cat_info = data.get("api_category") or {}
        user_cat = cat_info.get("user_category")
        cached_cat = cached_alt.get("category")
        is_fresh = True
        try:
            retrieved = datetime.fromisoformat(str(cached_alt.get("retrieved_at") or cached_alt.get("discovered_at")))
            if retrieved.tzinfo is None:
                retrieved = retrieved.replace(tzinfo=timezone.utc)
            try:
                max_age = max(60, int(os.getenv("API_DISCOVERY_CATEGORY_TTL", "10800")))
            except (TypeError, ValueError):
                max_age = 10800
            is_fresh = (datetime.now(timezone.utc) - retrieved).total_seconds() < max_age
        except (TypeError, ValueError):
            is_fresh = False
        live_lookup_was_attempted = cached_alt.get("cache_status") in {"hit", "refreshed", "fallback"}
        if (not user_cat or user_cat == cached_cat) and is_fresh and live_lookup_was_attempted:
            cached_alt["is_cached"] = True
            cached_alt["cache_status"] = "hit"
            cached_alt["scan_id"] = scan_id
            return AlternativesResponse(**cached_alt)

    cat_info = data.get("api_category") or {}
    category = cat_info.get("category") or "Unknown / Unclassified"
    user_category = cat_info.get("user_category")
    matched_signals = cat_info.get("matched_signals") or []
    op_ctx = data.get("operation_context")

    disc_result = await discover_alternatives(
        target_url=scan.url,
        target_hostname=scan.hostname,
        category=category,
        user_category=user_category,
        detected_signals=matched_signals,
        operation_context=op_ctx,
        limit=limit,
        include_live=True,
    )
    disc_result["scan_id"] = scan_id

    if scan.status == "completed":
        data["alternatives"] = disc_result
        scan.result_json = json.dumps(data)
        await db.commit()

    return AlternativesResponse(**disc_result)


@router.post("/scans/{scan_id}/alternatives/discover", response_model=AlternativesResponse, tags=["Alternatives"])
async def trigger_alternative_discovery(
    scan_id: str,
    limit: int = Query(default=5, ge=1, le=20),
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Force re-discovery of alternative APIs for a scan (e.g. after category correction).
    """
    scan = await get_authorized_scan(scan_id, db, user, write=True)
    if scan.status not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail="Scan has not completed yet.")

    data: dict = {}
    if scan.result_json:
        try:
            data = json.loads(scan.result_json)
        except Exception:
            data = {}

    cat_info = data.get("api_category") or {}
    category = cat_info.get("category") or "Unknown / Unclassified"
    user_category = cat_info.get("user_category")
    matched_signals = cat_info.get("matched_signals") or []
    op_ctx = data.get("operation_context")

    disc_result = await discover_alternatives(
        target_url=scan.url,
        target_hostname=scan.hostname,
        category=category,
        user_category=user_category,
        detected_signals=matched_signals,
        operation_context=op_ctx,
        limit=limit,
        include_live=True,
        refresh_live=True,
    )
    disc_result["scan_id"] = scan_id

    if scan.status == "completed":
        data["alternatives"] = disc_result
        scan.result_json = json.dumps(data)
        await db.commit()

    return AlternativesResponse(**disc_result)


# ── Alternative API Security Scanning (Step 3) ──────────────────────────────────

@router.post("/scans/{scan_id}/alternatives/scan", response_model=AlternativeScansListResponse, tags=["Alternatives"])
async def scan_alternatives(
    scan_id: str,
    payload: AlternativeScanRequest,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Execute genuine security scans on selected discovered alternative APIs.
    Performs real TLS handshake, HTTP header checks, information leakage, and reputation analysis.
    Never fabricates scores.
    """
    from app.services.alternative_scan_service import scan_selected_alternatives

    await get_authorized_scan(scan_id, db, user, write=True)

    try:
        return await scan_selected_alternatives(
            scan_id=scan_id,
            alternative_ids=payload.alternative_ids,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to scan alternatives: {exc}")


@router.get("/scans/{scan_id}/alternatives/scans", response_model=AlternativeScansListResponse, tags=["Alternatives"])
async def list_alternative_scans(
    scan_id: str,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve all security assessments conducted on alternative APIs for a given primary scan.
    """
    from app.services.alternative_scan_service import get_alternative_scans

    await get_authorized_scan(scan_id, db, user)

    try:
        return await get_alternative_scans(scan_id=scan_id, db=db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve alternative scans: {exc}")


@router.get("/scans/{scan_id}/alternatives/scans/{alternative_id}", response_model=AlternativeScanResultOut, tags=["Alternatives"])
async def get_alternative_scan_detail(
    scan_id: str,
    alternative_id: str,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve the detailed security assessment findings and evidence for a specific alternative API.
    """
    from app.services.alternative_scan_service import get_single_alternative_scan

    await get_authorized_scan(scan_id, db, user)

    try:
        result = await get_single_alternative_scan(scan_id=scan_id, alternative_id=alternative_id, db=db)
        if not result:
            raise HTTPException(status_code=404, detail=f"No scan found for alternative '{alternative_id}'.")
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve alternative scan detail: {exc}")


# ── Intelligent API Comparison & Recommendations (Step 4) ──────────────────────

@router.get("/scans/{scan_id}/comparison", response_model=ApiComparisonResponse, tags=["Comparison"])
async def get_scan_comparison(
    scan_id: str,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve the evidence-based comparison and recommendations between the original API
    and its discovered/scanned alternatives. Never dispatches new scans.
    """
    from app.services.api_comparison_service import generate_api_comparison

    await get_authorized_scan(scan_id, db, user)

    try:
        return await generate_api_comparison(scan_id=scan_id, db=db, force_recalculate=False)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate comparison: {exc}")


@router.post("/scans/{scan_id}/comparison/recalculate", response_model=ApiComparisonResponse, tags=["Comparison"])
async def recalculate_scan_comparison(
    scan_id: str,
    payload: Optional[ComparisonRecalculateRequest] = None,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Recalculate comparison metrics and recommendations with optional custom weights
    using existing persisted telemetry. Never triggers new scans.
    """
    from app.services.api_comparison_service import generate_api_comparison

    await get_authorized_scan(scan_id, db, user, write=True)

    custom_weights = None
    if payload:
        custom_weights = {
            "security_performance": payload.security_weight,
            "functional_relevance": payload.relevance_weight,
            "compatibility": payload.compatibility_weight,
            "verified_pricing": payload.pricing_weight,
            "evidence_completeness": payload.completeness_weight,
        }

    try:
        return await generate_api_comparison(
            scan_id=scan_id,
            db=db,
            custom_weights=custom_weights,
            force_recalculate=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to recalculate comparison: {exc}")


# ── OpenAPI Specifications ──────────────────────────────────────────────────────

@router.post("/specifications/analyze", response_model=SpecAnalysisOut, tags=["Specifications"])
async def analyze_specification(
    url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    if url:
        try:
            return await openapi_service.analyze_url(url)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to fetch specification: {exc}")
    elif file:
        content = await file.read()
        try:
            return openapi_service.analyze_upload(content, file.filename or "spec.json")
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to parse specification: {exc}")
    else:
        raise HTTPException(status_code=422, detail="Provide either a 'url' or a 'file'.")
