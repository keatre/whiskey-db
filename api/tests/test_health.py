# api/tests/test_health.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    r = client.get("/health")
    assert r.status_code == 200
    # Be flexible about the response shape:
    data = r.json()
    # Common patterns:
    assert any(
        data.get(k) in (True, "ok", "healthy", "pass")
        for k in ("ok", "status", "healthy")
    )
