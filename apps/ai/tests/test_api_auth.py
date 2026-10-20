from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.api.auth import check_api_key_configured
from main import app

client = TestClient(app)


def test_health_needs_no_key():
    with patch("app.api.auth.settings.ai_service_api_key", "secret"):
        assert client.get("/health/").status_code == 200


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer wrong"}, {"Authorization": "secret"}],
)
def test_protected_routes_reject_a_missing_or_wrong_key(headers):
    with patch("app.api.auth.settings.ai_service_api_key", "secret"):
        response = client.post("/email/classify", json={}, headers=headers)

    assert response.status_code == 401


def test_protected_routes_accept_the_right_key():
    with patch("app.api.auth.settings.ai_service_api_key", "secret"):
        # Passes auth; then fails body validation (422), not auth (401).
        response = client.post(
            "/email/classify",
            json={},
            headers={"Authorization": "Bearer secret"},
        )

    assert response.status_code == 422


def test_production_refuses_to_start_without_a_key():
    with (
        patch("app.api.auth.settings.ai_service_api_key", ""),
        patch("app.api.auth.settings.app_env", "production"),
        pytest.raises(RuntimeError),
    ):
        check_api_key_configured()


def test_development_without_a_key_only_warns():
    with (
        patch("app.api.auth.settings.ai_service_api_key", ""),
        patch("app.api.auth.settings.app_env", "development"),
    ):
        check_api_key_configured()
