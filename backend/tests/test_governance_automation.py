import json

from app.services.governance_automation import evaluate_policy


def test_https_policy_uses_target_and_reports_violation():
    result = evaluate_policy(
        {"rule_type": "https_required", "configuration": {}},
        {"id": "scan-1", "target_url": "http://api.example.test"},
    )
    assert result["outcome"] == "non_compliant"
    assert "http" in result["reason"]


def test_minimum_score_policy_uses_threshold_configuration():
    result = evaluate_policy(
        {"rule_type": "minimum_score", "configuration": {"threshold": 80}},
        {"id": "scan-2", "score": 75},
    )
    assert result["outcome"] == "non_compliant"


def test_missing_control_evidence_is_inconclusive():
    result = evaluate_policy(
        {"rule_type": "hsts_required", "configuration": {}},
        {"id": "scan-3", "target_url": "https://api.example.test", "result_json": json.dumps({"test_results": {}})},
    )
    assert result["outcome"] == "inconclusive"


def test_unsupported_history_dependent_rule_is_not_assumed_compliant():
    result = evaluate_policy(
        {"rule_type": "scan_frequency_days", "configuration": {"threshold": 7}},
        {"id": "scan-4", "target_url": "https://api.example.test"},
    )
    assert result["outcome"] == "inconclusive"
