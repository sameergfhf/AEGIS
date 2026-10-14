"""
app/services/visualization_service.py — Prepare chart data and flow graphs.

All data is derived from actual scan events. No illustrative or random data is inserted.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx

from app.config import get_settings
from app.schemas import (
    FindingsBySeverity,
    FlowEdge,
    FlowGraph,
    FlowNode,
    LatencyPoint,
    LatencyStats,
    TestResult,
    VisualizationsOut,
)
from app.security.url_validation import resolve_and_validate, validate_redirect_destination, URLValidationError

settings = get_settings()

_SEVERITY_COLORS = {
    "critical": "#ef4444",
    "high": "#f97316",
    "medium": "#eab308",
    "low": "#3b82f6",
    "informational": "#6b7280",
}


# ── Latency Sampling ─────────────────────────────────────────────────────────────

async def _single_request(
    client: httpx.AsyncClient, url: str, n: int, resolved_ip: Optional[str] = None
) -> LatencyPoint:
    """Make a single timed GET request and return a LatencyPoint."""
    start = time.monotonic()
    try:
        resp = await client.get(url, timeout=settings.request_timeout_seconds)
        elapsed_ms = (time.monotonic() - start) * 1000
        return LatencyPoint(
            request_number=n,
            response_time_ms=round(elapsed_ms, 2),
            status_code=resp.status_code,
            timed_out=False,
        )
    except httpx.TimeoutException:
        return LatencyPoint(
            request_number=n,
            response_time_ms=None,
            status_code=None,
            timed_out=True,
            error="Request timed out",
        )
    except Exception as exc:
        return LatencyPoint(
            request_number=n,
            response_time_ms=None,
            status_code=None,
            timed_out=False,
            error=str(exc)[:200],
        )


async def collect_latency_samples(url: str, resolved_ip: str) -> LatencyStats:
    """Run N sequential GET requests and collect latency data."""
    n_samples = settings.scan_latency_samples
    samples: List[LatencyPoint] = []

    async with httpx.AsyncClient(
        follow_redirects=False,
        limits=httpx.Limits(max_connections=1),
    ) as client:
        for i in range(1, n_samples + 1):
            point = await _single_request(client, url, i, resolved_ip)
            samples.append(point)
            if i < n_samples:
                await asyncio.sleep(0.3)  # Brief pause between samples

    valid_times = [p.response_time_ms for p in samples if p.response_time_ms is not None]
    failed = sum(1 for p in samples if p.response_time_ms is None)

    return LatencyStats(
        avg_ms=round(sum(valid_times) / len(valid_times), 2) if valid_times else None,
        min_ms=round(min(valid_times), 2) if valid_times else None,
        max_ms=round(max(valid_times), 2) if valid_times else None,
        failed_requests=failed,
        samples=samples,
    )


# ── Flow Graph Builder ────────────────────────────────────────────────────────────

def build_flow_graph(
    url: str,
    scan_events: List[Dict[str, Any]],
    redirects: List[str],
    findings_count: int,
) -> FlowGraph:
    """
    Generate a React Flow graph from actual scan events.
    Nodes represent real observed stages; edges represent transitions.
    """
    nodes: List[FlowNode] = []
    edges: List[FlowEdge] = []
    parsed = urlparse(url)
    hostname = parsed.hostname or url

    def add_node(node_id: str, label: str, node_type: str, data: Dict[str, Any]) -> FlowNode:
        x_positions = {
            "input": 50, "validation": 250, "request": 450,
            "redirect": 650, "response": 450, "analysis": 650, "result": 850,
        }
        y_base = {
            "input": 200, "validation": 200, "request": 200,
            "redirect": 350, "response": 350, "analysis": 200, "result": 200,
        }
        offset = len(nodes) * 15
        node = FlowNode(
            id=node_id,
            type=node_type,
            label=label,
            data=data,
            position={"x": x_positions.get(node_type, 200) + offset, "y": y_base.get(node_type, 200)},
        )
        nodes.append(node)
        return node

    def add_edge(source: str, target: str, label: str = "", animated: bool = False, color: str = "#6b7280"):
        edges.append(FlowEdge(
            id=f"e-{source}-{target}",
            source=source,
            target=target,
            label=label,
            animated=animated,
            style={"stroke": color},
        ))

    # Node 1: URL Submitted
    add_node("n-input", f"URL Submitted\n{hostname}", "input", {
        "url": url,
        "stage": "input",
        "description": "User submitted this API URL for scanning.",
    })

    # Node 2: Validation
    validation_event = next((e for e in scan_events if e.get("stage") == "validation"), None)
    validation_status = (validation_event or {}).get("status", "unknown")
    validation_ok = validation_status == "ok"
    add_node("n-validation", f"URL Validated\n{'✓' if validation_ok else '✗'}", "validation", {
        "stage": "validation",
        "status": validation_status,
        "resolved_ip": (validation_event or {}).get("resolved_ip"),
        "description": "SSRF-resistant validation: scheme, credentials, and IP range checks performed.",
    })
    add_edge("n-input", "n-validation", "validate", color="#3b82f6")

    if not validation_ok:
        add_node("n-blocked", "Scan Blocked", "result", {
            "stage": "blocked",
            "reason": (validation_event or {}).get("error", "Validation failed"),
        })
        add_edge("n-validation", "n-blocked", "blocked", color="#ef4444")
        return FlowGraph(nodes=nodes, edges=edges)

    # Node 3: HTTP Request
    request_event = next((e for e in scan_events if e.get("stage") == "request"), None)
    add_node("n-request", f"HTTP Request Sent\nGET {parsed.path or '/'}", "request", {
        "stage": "request",
        "method": "GET",
        "url": url,
        "description": "Controlled HTTP GET request with strict timeouts and response-size limits.",
    })
    add_edge("n-validation", "n-request", "request", animated=True, color="#06b6d4")

    # Nodes for redirects
    if redirects:
        prev_id = "n-request"
        for i, redir in enumerate(redirects[:settings.max_redirects]):
            redir_id = f"n-redirect-{i}"
            redir_hostname = urlparse(redir).hostname or redir
            add_node(redir_id, f"Redirect {i+1}\n→ {redir_hostname}", "redirect", {
                "stage": "redirect",
                "destination": redir,
                "description": f"Redirect destination validated before following.",
            })
            add_edge(prev_id, redir_id, f"301/302", color="#f97316")
            prev_id = redir_id
        # Final response after redirects
        resp_event = next((e for e in scan_events if e.get("stage") == "response"), None)
        status_code = (resp_event or {}).get("status_code", "?")
        add_node("n-response", f"Final Response\nHTTP {status_code}", "response", {
            "stage": "response",
            "status_code": status_code,
            **(resp_event or {}),
        })
        add_edge(prev_id, "n-response", f"HTTP {status_code}", color="#22c55e")
    else:
        resp_event = next((e for e in scan_events if e.get("stage") == "response"), None)
        status_code = (resp_event or {}).get("status_code", "?")
        add_node("n-response", f"Response Received\nHTTP {status_code}", "response", {
            "stage": "response",
            "status_code": status_code,
            **(resp_event or {}),
        })
        add_edge("n-request", "n-response", f"HTTP {status_code}", color="#22c55e")

    # Node: Header analysis
    add_node("n-headers", "Headers Analyzed", "analysis", {
        "stage": "analysis",
        "type": "headers",
        "description": "Security headers inspected for presence and configuration.",
    })
    add_edge("n-response", "n-headers", "inspect", color="#8b5cf6")

    # Node: Content analysis
    add_node("n-content", "Content Analyzed", "analysis", {
        "stage": "analysis",
        "type": "content",
        "description": "Response body scanned for information leakage patterns.",
    })
    add_edge("n-response", "n-content", "analyze", color="#8b5cf6")

    # Node: Findings
    finding_color = "#22c55e" if findings_count == 0 else "#ef4444"
    add_node("n-findings", f"{'No Issues Found' if findings_count == 0 else f'{findings_count} Finding(s)'}", "result", {
        "stage": "result",
        "findings_count": findings_count,
        "description": "Security findings generated from evidence collected during the scan.",
    })
    add_edge("n-headers", "n-findings", "findings", color=finding_color)
    add_edge("n-content", "n-findings", "findings", color=finding_color)

    return FlowGraph(nodes=nodes, edges=edges)


# ── Findings by Severity ──────────────────────────────────────────────────────────

def count_findings_by_severity(test_results: Dict[str, TestResult]) -> FindingsBySeverity:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0}
    for result in test_results.values():
        for finding in result.findings:
            sev = (finding.get("severity") or "").lower()
            if sev in counts and finding.get("status") in ("fail", "warning"):
                counts[sev] += 1
    return FindingsBySeverity(**counts)
