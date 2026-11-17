from types import SimpleNamespace
import pytest
from app.services import supabase_sync


def test_service_auth_uses_canonical_project_and_opaque_key(monkeypatch):
    monkeypatch.setattr(supabase_sync, "get_settings", lambda: SimpleNamespace(
        supabase_auth_url="https://workspace-project.supabase.co/",
        supabase_workspace_service_role_key="sb_secret_test_value",
        supabase_url="https://legacy-scan-project.supabase.co",
    ))
    url = supabase_sync._get_supabase_config()[0]
    headers = supabase_sync._get_rest_headers()
    assert url == "https://workspace-project.supabase.co"
    assert headers["apikey"] == "sb_secret_test_value"
    assert "Authorization" not in headers


def test_legacy_service_role_key_is_sent_as_authorization_jwt(monkeypatch):
    monkeypatch.setattr(supabase_sync, "get_settings", lambda: SimpleNamespace(
        supabase_auth_url="https://workspace-project.supabase.co",
        supabase_workspace_service_role_key="legacy-service-role-jwt",
    ))
    assert supabase_sync._get_rest_headers()["Authorization"] == "Bearer legacy-service-role-jwt"


def test_missing_canonical_service_key_fails_closed(monkeypatch):
    monkeypatch.setattr(supabase_sync, "get_settings", lambda: SimpleNamespace(
        supabase_auth_url="https://workspace-project.supabase.co",
        supabase_workspace_service_role_key="",
    ))
    with pytest.raises(ValueError, match="Canonical workspace service authentication"):
        supabase_sync._get_rest_headers()
