from __future__ import annotations

import importlib
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session, select


def _configure_test_db() -> None:
    fd, path_str = tempfile.mkstemp(prefix="test-market-prices", suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path_str}"


_configure_test_db()

REPO_ROOT = Path(__file__).resolve().parents[2]
API_ROOT = REPO_ROOT / "api"
for entry in (API_ROOT, REPO_ROOT):
    entry_str = str(entry)
    if entry_str not in sys.path:
        sys.path.insert(0, entry_str)

db_module = importlib.import_module("app.db")
engine = db_module.engine
init_db = db_module.init_db

app = importlib.import_module("app.main").app
models_module = importlib.import_module("app.models")
MarketPrice = models_module.MarketPrice
User = models_module.User
hash_password = importlib.import_module("app.security").hash_password


def bootstrap_admin(username: str = "root", password: str = "AdminPass123!") -> None:
    init_db()
    with Session(engine) as session:
        existing = session.exec(select(User).where(User.username == username)).first()
        if existing:
            existing.password_hash = hash_password(password)
            existing.role = "admin"
            existing.is_active = True
            session.add(existing)
        else:
            session.add(
                User(
                    username=username,
                    email="root@example.com",
                    password_hash=hash_password(password),
                    role="admin",
                    is_active=True,
                )
            )
        session.commit()


def login(client: TestClient, username: str = "root", password: str = "AdminPass123!") -> None:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200


def test_get_valuation_uses_database_record():
    init_db()
    upc = "012345678905"
    with Session(engine) as session:
        session.add(
            MarketPrice(
                barcode_upc=upc,
                price=99.5,
                currency="USD",
                source="Manual upload",
                provider="manual",
                as_of=datetime(2024, 1, 1, tzinfo=timezone.utc),
                ingest_type="manual",
                created_by="tester",
            )
        )
        session.commit()

    client = TestClient(app)
    resp = client.get("/valuation", params={"upc": upc})
    assert resp.status_code == 200
    data = resp.json()
    assert data["barcode_upc"] == upc
    assert data["price"] == 99.5
    assert data["currency"] == "USD"
    assert data["source"] == "Manual upload"
    assert data["as_of"].startswith("2024-01-01")


def test_admin_can_create_price_record():
    init_db()
    bootstrap_admin()
    client = TestClient(app)
    login(client)

    payload = {
        "barcode_upc": "555555000111",
        "price": 150.75,
        "currency": "usd",
        "source": "Auction Sheet",
        "provider": "auction_house",
        "as_of": "2024-07-01T00:00:00Z",
        "notes": "Summer catalog",
    }
    resp = client.post("/admin/prices", json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["barcode_upc"] == payload["barcode_upc"]
    assert data["price"] == payload["price"]
    assert data["currency"] == "USD"
    assert data["source"] == payload["source"]
    assert data["provider"] == payload["provider"]
    assert data["notes"] == payload["notes"]

    resp2 = client.get("/valuation", params={"upc": payload["barcode_upc"]})
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["price"] == payload["price"]


def test_sync_price_persists_external_quote(monkeypatch):
    from app.services import market_prices as market_services
    admin_prices_module = importlib.import_module("app.routers.admin_prices")

    init_db()
    bootstrap_admin()
    client = TestClient(app)
    login(client)

    upc = "444444444444"

    def fake_fetch(upc_value: str):
        assert upc_value == upc
        return market_services.ExternalQuote(
            barcode_upc=upc_value,
            price=88.0,
            currency="usd",
            source="Example API",
            as_of=datetime(2024, 8, 15, tzinfo=timezone.utc),
            provider="example_api",
            raw={"price": 88.0},
        )

    monkeypatch.setattr(market_services, "fetch_external_quote", fake_fetch)
    monkeypatch.setattr(admin_prices_module, "fetch_external_quote", fake_fetch)

    resp = client.post("/admin/prices/sync", json={"barcode_upc": upc, "notes": "Synced for test"})
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["barcode_upc"] == upc
    assert data["price"] == 88.0
    assert data["currency"] == "USD"
    assert data["source"] == "Example API"
    assert data["provider"] == "example_api"
    assert data["notes"] == "Synced for test"

    valuation = client.get("/valuation", params={"upc": upc})
    assert valuation.status_code == 200
    vdata = valuation.json()
    assert vdata["price"] == 88.0


def test_admin_can_update_price_record():
    init_db()
    bootstrap_admin()
    client = TestClient(app)
    login(client)

    payload = {
        "barcode_upc": "777777777777",
        "price": 120.0,
        "currency": "usd",
        "source": "Manual upload",
        "provider": "manual",
        "as_of": "2024-10-08T14:00:00Z",
        "notes": "Initial record",
    }
    create = client.post("/admin/prices", json=payload)
    assert create.status_code == 201, create.text
    record = create.json()

    update_payload = {
        "price": 118.5,
        "currency": "eur",
        "notes": "Adjusted price",
    }
    update = client.patch(f"/admin/prices/{record['price_id']}", json=update_payload)
    assert update.status_code == 200, update.text
    updated = update.json()
    assert updated["price"] == 118.5
    assert updated["currency"] == "EUR"
    assert updated["notes"] == "Adjusted price"
