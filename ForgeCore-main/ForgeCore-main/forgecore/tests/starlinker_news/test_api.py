from fastapi.testclient import TestClient

from forgecore.starlinker_news.api import create_app
from forgecore.starlinker_news.backend import StarlinkerBackend


def test_health_endpoint_reports_defaults(tmp_path):
    backend = StarlinkerBackend(tmp_path)
    app = create_app(backend=backend)
    with TestClient(app) as client:
        response = client.get("/health")
        payload = response.json()

    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["config"]["timezone"] == "America/New_York"
    assert payload["scheduler"]["running"] is True


def test_poll_endpoint_updates_health(tmp_path):
    backend = StarlinkerBackend(tmp_path)
    app = create_app(backend=backend)
    with TestClient(app) as client:
        poll_response = client.post("/run/poll", json={"reason": "test"})
        assert poll_response.status_code == 200
        health = client.get("/health").json()

    assert health["scheduler"]["last_poll_reason"] == "test"
    assert health["scheduler"]["last_poll"] is not None


def test_settings_can_be_updated(tmp_path):
    backend = StarlinkerBackend(tmp_path)
    app = create_app(backend=backend)
    with TestClient(app) as client:
        current = client.get("/settings").json()
        current["outputs"]["discord_webhook"] = "https://hooks.example"
        update = client.put("/settings", json=current)
        assert update.status_code == 200

        refreshed = client.get("/settings").json()

    assert refreshed["outputs"]["discord_webhook"] == "https://hooks.example"
    assert backend.missing_prerequisites() == []


def test_settings_patch_updates_nested_fields(tmp_path):
    backend = StarlinkerBackend(tmp_path)
    app = create_app(backend=backend)
    with TestClient(app) as client:
        response = client.patch("/settings", json={"outputs": {"email_to": "ops@example"}})
        assert response.status_code == 200
        payload = response.json()

    assert payload["outputs"]["email_to"] == "ops@example"
    assert backend.load_config().outputs.email_to == "ops@example"


def test_settings_patch_rejects_invalid_values(tmp_path):
    backend = StarlinkerBackend(tmp_path)
    app = create_app(backend=backend)
    with TestClient(app) as client:
        response = client.patch("/settings", json={"appearance": {"theme": "unknown"}})

    assert response.status_code == 422
    assert backend.load_config().appearance.theme == "neutral"


def test_settings_defaults_and_schema(tmp_path):
    backend = StarlinkerBackend(tmp_path)
    app = create_app(backend=backend)
    with TestClient(app) as client:
        defaults = client.get("/settings/defaults").json()
        schema = client.get("/settings/schema").json()

    assert defaults["schedule"]["priority_poll_minutes"] == 60
    assert "properties" in schema
    assert "timezone" in schema["properties"]
