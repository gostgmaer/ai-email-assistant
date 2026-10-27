from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_embeds_every_text_in_request_order():
    with (
        patch("app.api.auth.settings.ai_service_api_key", ""),
        patch(
            "app.api.routes.documents.embedding_manager.embed_batch",
            side_effect=lambda texts: [[float(len(text))] for text in texts],
        ) as embed_batch,
    ):
        response = client.post(
            "/documents/embed-batch", json={"texts": ["a", "bbb", "cc"]}
        )

    assert response.status_code == 200
    assert response.json()["embeddings"] == [[1.0], [3.0], [2.0]]
    embed_batch.assert_called_once_with(["a", "bbb", "cc"])


def test_rejects_an_empty_batch():
    with patch("app.api.auth.settings.ai_service_api_key", ""):
        response = client.post("/documents/embed-batch", json={"texts": []})

    assert response.status_code == 422


def test_rejects_a_batch_over_the_provider_limit():
    with patch("app.api.auth.settings.ai_service_api_key", ""):
        response = client.post(
            "/documents/embed-batch", json={"texts": ["x"] * 101}
        )

    assert response.status_code == 422


def test_reports_a_provider_quota_error_as_429():
    with (
        patch("app.api.auth.settings.ai_service_api_key", ""),
        patch(
            "app.api.routes.documents.embedding_manager.embed_batch",
            side_effect=RuntimeError(
                "Error embedding content (RESOURCE_EXHAUSTED): 429 quota"
            ),
        ),
    ):
        response = client.post("/documents/embed-batch", json={"texts": ["a"]})

    assert response.status_code == 429


def test_other_provider_errors_are_not_reported_as_429():
    failing = TestClient(app, raise_server_exceptions=False)
    with (
        patch("app.api.auth.settings.ai_service_api_key", ""),
        patch(
            "app.api.routes.documents.embedding_manager.embed_batch",
            side_effect=RuntimeError("invalid model"),
        ),
    ):
        response = failing.post("/documents/embed-batch", json={"texts": ["a"]})

    assert response.status_code == 500
