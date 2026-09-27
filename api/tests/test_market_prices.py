from __future__ import annotations

import importlib
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session, select
from zoneinfo import ZoneInfo


def _configure_test_db() -> None:
    fd, path_str = tempfile.mkstemp(prefix="test-market-prices", suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path_str}"
    os.environ.setdefault("TZ", "America/Chicago")


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

    bootstrap_admin()
    client = TestClient(app)
    login(client)
    resp = client.get("/valuation", params={"upc": upc})
    assert resp.status_code == 200
    data = resp.json()
    assert data["barcode_upc"] == upc
    assert data["price"] == 99.5
    assert data["currency"] == "USD"
    assert data["source"] == "Manual upload"
    assert data["as_of"].startswith("2024-01-01")


def test_valuation_requires_view_access():
    init_db()
    client = TestClient(app)

    resp = client.get("/valuation", params={"upc": "000000000000"})

    assert resp.status_code == 401


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
        "as_of": "2024-07-01T00:00:00",
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
    tz = ZoneInfo(os.environ.get("TZ", "UTC"))
    as_of = datetime.fromisoformat(data["as_of"])
    if as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=tz)
    expected = datetime(2024, 7, 1, 0, 0, tzinfo=tz)
    assert as_of == expected

    resp2 = client.get("/valuation", params={"upc": payload["barcode_upc"]})
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["price"] == payload["price"]


def test_admin_prices_list_requires_admin():
    init_db()
    bootstrap_admin()
    client = TestClient(app)

    unauthenticated = client.get("/admin/prices")
    assert unauthenticated.status_code == 403

    login(client)
    authenticated = client.get("/admin/prices")
    assert authenticated.status_code == 200
    assert isinstance(authenticated.json(), list)


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


# Retail tracking remains separate from legacy UPC valuations.
def _retail_product():
    return {
        "product_url": "https://lovescotch.com/products/test-whiskey",
        "product_title": "Test Whiskey 750ml", "currency": "USD",
        "variants": [{"variant_id": "123", "title": "750ml", "barcode": "0123",
                      "price_cents": 10999, "available": True}],
    }


def test_retail_link_history_failure_and_access(monkeypatch):
    from datetime import timedelta
    from app.models import Bottle, Purchase, RetailPriceLink, RetailPriceObservation
    from app.services import retail_prices as service

    bootstrap_admin()
    with Session(engine) as session:
        bottle = Bottle(brand="Retail test")  # Deliberately no UPC.
        session.add(bottle)
        session.commit()
        session.refresh(bottle)
        bid = bottle.bottle_id
        session.add(Purchase(bottle_id=bid, price_paid=89.99))
        session.commit()
    base = f"/bottles/{bid}/retail-price"
    guest = TestClient(app)
    assert guest.get(base).status_code == 401
    for path, method in [("/preview", "post"), ("/link", "put"), ("/refresh", "post"), ("/link", "delete")]:
        assert guest.request(method, base + path, json={}).status_code == 403

    client = TestClient(app)
    login(client)
    product = _retail_product()
    monkeypatch.setattr(service, "fetch_product", lambda url: product)
    payload = {"product_url": product["product_url"], "variant_id": "123"}
    assert client.post(base + "/preview", json=payload).json()["variants"][0]["price_cents"] == 10999
    assert client.put(base + "/link", json=payload).status_code == 422
    payload["confirmed"] = True
    assert client.put(base + "/link", json={**payload, "variant_id": "999"}).status_code == 422
    saved = client.put(base + "/link", json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()["latest"]["price_cents"] == 10999
    assert saved.json()["latest"]["checked_at"].endswith("+00:00")
    assert client.post(base + "/refresh").status_code == 429

    def allow_refresh():
        with Session(engine) as session:
            link = session.get(RetailPriceLink, bid)
            link.last_attempt_at = service.utcnow() - timedelta(days=2)
            session.add(link)
            session.commit()

    allow_refresh()
    product["variants"][0].update(price_cents=9999, available=False)
    refreshed = client.post(base + "/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["latest"]["available"] is False
    assert len(refreshed.json()["history"]) == 2
    allow_refresh()
    product["variants"][0]["barcode"] = "changed"
    assert client.post(base + "/refresh").status_code == 502
    state = client.get(base).json()
    assert state["latest"]["price_cents"] == 9999
    assert "barcode changed" in state["link"]["last_error"]
    assert len(state["history"]) == 2
    with Session(engine) as session:
        purchase = session.exec(select(Purchase).where(Purchase.bottle_id == bid)).one()
        assert purchase.price_paid == 89.99
    assert client.delete(base + "/link").json()["latest"] is None
    assert len(client.get(base).json()["history"]) == 2
    assert client.delete(f"/bottles/{bid}").status_code == 204
    with Session(engine) as session:
        assert not session.exec(select(RetailPriceObservation).where(RetailPriceObservation.bottle_id == bid)).all()


def test_lovescotch_adapter_validation(monkeypatch):
    import pytest
    import httpx
    from app.services import retail_prices as service

    for url in ["https://[invalid/products/test", "http://lovescotch.com/products/test", "https://evil.test/products/test",
                "https://lovescotch.com@evil.test/products/test", "https://lovescotch.com/search?q=test",
                "https://lovescotch.com:443/products/test", "https://lovescotch.com/products/../admin"]:
        with pytest.raises(service.RetailPriceError):
            service.canonical_url(url)
    assert service.canonical_url("https://www.lovescotch.com/products/test/?variant=123") == "https://lovescotch.com/products/test"

    currency_code = "USD"
    cents = 10999
    response_status = 200
    urls = []

    def handle(request):
        urls.append(str(request.url))
        if request.url.path.endswith(".js"):
            return httpx.Response(response_status, json={"title": "Whiskey", "variants": [
                {"id": 123, "title": "750ml", "barcode": "0123", "price": cents,
                 "compare_at_price": 11999, "available": False},
            ]})
        assert request.headers["accept"] == "text/html"
        return httpx.Response(200, text=f'Shopify.currency = {{"active":"{currency_code}","rate":"1.0"}};')

    original_client = httpx.Client
    monkeypatch.setattr(service.httpx, "Client", lambda **kwargs: original_client(
        transport=httpx.MockTransport(handle), **kwargs))
    monkeypatch.setattr(service.time, "sleep", lambda seconds: None)
    product = service.fetch_product("https://lovescotch.com/products/test")
    assert product["variants"][0]["price_cents"] == 10999
    assert product["variants"][0]["available"] is False
    assert product["variants"][0]["barcode"] == "0123"
    for bad in [-1, 0, "10999", True, None]:
        cents = bad
        with pytest.raises(service.RetailPriceError):
            service.fetch_product(product["product_url"])
    cents = 10999
    response_status = 429
    with pytest.raises(service.RetailPriceError):
        service.fetch_product(product["product_url"])
    currency_code = "EUR"
    urls.clear()
    with pytest.raises(service.RetailPriceError, match="USD"):
        service.fetch_product(product["product_url"])
    assert len(urls) == 1


def test_retail_scheduler_due_and_disabled(monkeypatch):
    from datetime import timedelta
    from app.models import Bottle, RetailPriceLink, RetailPriceObservation
    from app.services import retail_prices as service
    from app.settings import settings

    init_db()
    product = _retail_product()
    with Session(engine) as session:
        bottle = Bottle(brand="Scheduler test")
        session.add(bottle)
        session.commit()
        session.refresh(bottle)
        bid = bottle.bottle_id
        session.add(RetailPriceLink(bottle_id=bid, product_url=product["product_url"],
                                   variant_id="123", product_title=product["product_title"]))
        session.commit()
    calls = []
    def fetch(url):
        calls.append(url)
        return product
    monkeypatch.setattr(service, "fetch_product", fetch)
    monkeypatch.setattr(settings, "RETAIL_PRICE_AUTO_REFRESH", False)
    service.refresh_due_prices()
    assert calls == []
    monkeypatch.setattr(settings, "RETAIL_PRICE_AUTO_REFRESH", True)
    service.refresh_due_prices()
    assert len(calls) == 1
    service.refresh_due_prices()
    assert len(calls) == 1
    with Session(engine) as session:
        row = session.exec(select(RetailPriceObservation).where(RetailPriceObservation.bottle_id == bid)).one()
        row.checked_at = service.utcnow() - timedelta(days=8)
        link = session.get(RetailPriceLink, bid)
        link.last_attempt_at = service.utcnow() - timedelta(days=2)
        session.add(row)
        session.add(link)
        session.commit()
    def fail(url):
        calls.append(url)
        raise service.RetailPriceError("Offline")
    monkeypatch.setattr(service, "fetch_product", fail)
    service.refresh_due_prices()
    service.refresh_due_prices()
    assert len(calls) == 2  # Failed check is not retried every hour.
    with Session(engine) as session:
        assert session.get(RetailPriceLink, bid).last_error == "Offline"


def test_purchase_auto_matches_upc_and_publishes_market_price(monkeypatch):
    from app.models import Bottle, RetailMatchState, RetailPriceLink
    from app.services import retail_matching as matching
    from app.services import retail_prices as prices

    bootstrap_admin()
    product = _retail_product()
    product["variants"][0]["barcode"] = "0088110140052"  # UPC represented as EAN.
    candidate = {"product_url": product["product_url"], "variant_id": "123",
                 "title": "Test Whiskey", "tags": ["750ml"], "variant_title": "750ml"}
    seen = []
    def candidates(session, barcode, **kwargs):
        seen.append(barcode)
        return [candidate]
    monkeypatch.setattr(matching, "catalog_candidates", candidates)
    monkeypatch.setattr(prices, "fetch_product", lambda url: product)
    with Session(engine) as session:
        bottle = Bottle(brand="Automatic", barcode_upc="088110140052", size_ml=750)
        session.add(bottle)
        session.commit()
        session.refresh(bottle)
        bid = bottle.bottle_id
    client = TestClient(app)
    login(client)
    response = client.post("/purchases", json={"bottle_id": bid, "price_paid": 89.99, "purchase_date": "2025-09-01"})
    assert response.status_code == 201, response.text
    assert seen == ["00088110140052"]
    with Session(engine) as session:
        assert session.get(RetailPriceLink, bid).variant_id == "123"
        assert session.get(RetailMatchState, bid).status == "matched"
    valuation = client.get("/valuation", params={"upc": "088110140052"}).json()
    assert valuation["price"] == 109.99
    assert valuation["source"] == "LoveScotch"
    state = client.get(f"/bottles/{bid}/retail-price").json()
    assert state["latest"]["price_cents"] == 10999
    # Later purchases reuse the confirmed link and do not repeat catalog discovery.
    assert client.post("/purchases", json={"bottle_id": bid, "price_paid": 95}).status_code == 201
    assert len(seen) == 1


def test_auto_matching_fallbacks_and_retry(monkeypatch):
    from app.models import Bottle, RetailMatchState, RetailPriceLink
    from app.services import retail_matching as matching
    from app.services import retail_prices as prices

    bootstrap_admin()
    product = _retail_product()
    product["variants"][0]["barcode"] = "088110140052"
    candidate = {"product_url": product["product_url"], "variant_id": "123",
                 "title": "Test Whiskey", "tags": ["750ml"], "variant_title": "750ml"}
    candidates = []
    monkeypatch.setattr(matching, "catalog_candidates", lambda session, barcode, **kwargs: candidates)
    monkeypatch.setattr(prices, "fetch_product", lambda url: product)
    client = TestClient(app)
    login(client)
    for barcode, year, found, expected in [
        (None, None, [], "missing_upc"),
        ("088110140052", None, [], "no_match"),
        ("088110140052", None, [candidate, candidate], "needs_review"),
        ("088110140052", 2025, [{**candidate, "title": "Test Whiskey 2024 Release"}], "needs_review"),
    ]:
        candidates = found
        with Session(engine) as session:
            bottle = Bottle(brand="Fallback", barcode_upc=barcode, release_year=year)
            session.add(bottle)
            session.commit()
            session.refresh(bottle)
            bid = bottle.bottle_id
        result = client.post("/purchases", json={"bottle_id": bid, "price_paid": 50})
        assert result.status_code == 201
        with Session(engine) as session:
            assert session.get(RetailMatchState, bid).status == expected
            assert session.get(RetailPriceLink, bid) is None
    # SKU candidate alone is insufficient; a mismatched real barcode must not link.
    with Session(engine) as session:
        bottle = session.get(Bottle, bid)
        bottle.release_year = None
        session.add(bottle)
        session.commit()
    candidates = [candidate]
    product["variants"][0]["barcode"] = "111111111111"
    assert client.post(f"/bottles/{bid}/retail-price/match").status_code == 202
    assert client.get(f"/bottles/{bid}/retail-price").json()["match"]["status"] == "no_match"
    # A corrected barcode succeeds on an explicit retry.
    product["variants"][0]["barcode"] = "088110140052"
    client.post(f"/bottles/{bid}/retail-price/match")
    assert client.get(f"/bottles/{bid}/retail-price").json()["match"]["status"] == "matched"
    assert TestClient(app).post(f"/bottles/{bid}/retail-price/match").status_code == 403


def test_catalog_cache_pagination_and_failures(monkeypatch):
    import httpx
    import pytest
    from datetime import timedelta
    from app.models import RetailCatalogCache
    from app.services import retail_matching as matching
    from app.services import retail_prices as prices

    init_db()
    monkeypatch.setattr(matching, "_catalog_failure_at", {})
    monkeypatch.setattr(matching.time, "sleep", lambda seconds: None)
    calls = []
    fail = False
    def handle(request):
        calls.append(str(request.url))
        page = request.url.params["page"]
        if fail:
            return httpx.Response(503)
        product = {"handle": "test-whiskey", "title": "Whiskey", "tags": ["750ml"],
                   "variants": [{"id": 123 if page == "1" else 456, "sku": "088110140052", "title": "750ml"}]}
        return httpx.Response(200, json={"products": [product] * (250 if page == "1" else 1)})
    original_client = httpx.Client
    monkeypatch.setattr(matching.httpx, "Client", lambda **kwargs: original_client(
        transport=httpx.MockTransport(handle), **kwargs))
    with Session(engine) as session:
        cache = session.get(RetailCatalogCache, "lovescotch")
        if cache:
            session.delete(cache)
            session.commit()
        candidates = matching.catalog_candidates(session, "00088110140052")
        assert len(candidates) == 2  # Duplicates across pages are retained as ambiguity.
        assert len(calls) == 2
        assert matching.catalog_candidates(session, "00088110140052") == candidates
        assert len(calls) == 2  # Warm lookups use the persistent cache.
        cache = session.get(RetailCatalogCache, "lovescotch")
        cache.fetched_at = prices.utcnow() - timedelta(days=8)
        session.add(cache)
        session.commit()
        previous = cache.candidates_json
        fail = True
        with pytest.raises(prices.RetailPriceError):
            matching.catalog_candidates(session, "00088110140052")
        assert session.get(RetailCatalogCache, "lovescotch").candidates_json == previous
        with pytest.raises(prices.RetailPriceError):
            matching.catalog_candidates(session, "00088110140052")
        assert len(calls) == 5  # Three bounded attempts, then back off after failure instead of retrying each purchase.


def test_purchase_survives_lookup_failure(monkeypatch):
    from app.models import Bottle, RetailMatchState
    from app.services import retail_matching as matching
    from app.services import retail_prices as prices

    bootstrap_admin()
    def fail(session, barcode, **kwargs):
        raise prices.RetailPriceError("Provider offline")
    monkeypatch.setattr(matching, "catalog_candidates", fail)
    with Session(engine) as session:
        bottle = Bottle(brand="Offline", barcode_upc="088110140052")
        session.add(bottle)
        session.commit()
        session.refresh(bottle)
        bid = bottle.bottle_id
    client = TestClient(app)
    login(client)
    result = client.post("/purchases", json={"bottle_id": bid, "price_paid": 49.99})
    assert result.status_code == 201
    assert client.get(f"/purchases/{result.json()['purchase_id']}").json()["price_paid"] == 49.99
    with Session(engine) as session:
        assert session.get(RetailMatchState, bid).status == "error"


def test_interrupted_match_can_be_retried():
    from datetime import timedelta
    from app.models import Bottle, RetailMatchState
    from app.services import retail_prices as prices

    bootstrap_admin()
    with Session(engine) as session:
        bottle = Bottle(brand="Interrupted")
        session.add(bottle)
        session.commit()
        session.refresh(bottle)
        bid = bottle.bottle_id
        session.add(RetailMatchState(bottle_id=bid, status="matching", message="Checking",
                                    updated_at=prices.utcnow() - timedelta(minutes=11)))
        session.commit()
    client = TestClient(app)
    login(client)
    state = client.get(f"/bottles/{bid}/retail-price").json()["match"]
    assert state["status"] == "error"
    assert "Retry" in state["message"]
    assert client.post(f"/bottles/{bid}/retail-price/match").status_code == 202
    assert client.get(f"/bottles/{bid}/retail-price").json()["match"]["status"] == "missing_upc"


def test_brand_discovery_precedes_full_catalog(monkeypatch):
    from app.services import retail_matching as matching
    from app.services import retail_prices as prices
    calls = []
    result = [{"variant_id": "123"}]
    fail_brand = False
    def lookup(session, barcode, collection=None):
        calls.append(collection)
        if collection and fail_brand:
            raise prices.RetailPriceError("Collection unavailable")
        return result if collection else [{"variant_id": "456"}]
    monkeypatch.setattr(matching, "catalog_candidates", lookup)
    assert matching.discover_candidates(None, "00088110140052", "Lagavulin") == result
    assert calls == ["lagavulin"]
    calls.clear()
    result = []
    assert matching.discover_candidates(None, "00088110140052", "Maker's Mark")[0]["variant_id"] == "456"
    assert calls == ["maker-s-mark", "makers-mark", "maker-s-mark-distillery", "makers-mark-distillery", None]
    calls.clear()
    fail_brand = True
    assert matching.discover_candidates(None, "00088110140052", "Lagavulin")[0]["variant_id"] == "456"
    assert calls == ["lagavulin", "lagavulin-distillery", None]


def test_oban_matches_when_retailer_title_has_no_year(monkeypatch):
    from app.models import Bottle, RetailMatchState, RetailPriceLink
    from app.services import retail_matching as matching, retail_prices as prices

    init_db()
    calls = []
    candidate = {"product_url": "https://lovescotch.com/products/oban-little-bay-small-cask",
                 "variant_id": "40238920990901", "title": "Oban Little Bay Single Malt Scotch Whisky",
                 "tags": ["750ml", "Oban"], "variant_title": "Default Title"}
    def lookup(session, barcode, collection=None):
        calls.append(collection)
        assert collection is not None, "Oban should not need a store-wide download"
        assert barcode == "00088076179806"
        return [candidate] if collection == "oban-distillery" else []
    monkeypatch.setattr(matching, "catalog_candidates", lookup)
    product = _retail_product()
    product.update(product_url=candidate["product_url"], product_title=candidate["title"])
    product["variants"][0].update(variant_id=candidate["variant_id"], barcode="088076179806", price_cents=6699)
    monkeypatch.setattr(prices, "fetch_product", lambda url: product)
    with Session(engine) as session:
        bottle = Bottle(brand="Oban", expression="Little Bay - Small Cask", barcode_upc="088076179806",
                        size_ml=750, release_year=2025)
        session.add(bottle)
        session.commit()
        session.refresh(bottle)
        bid = bottle.bottle_id
    matching.match_bottle(bid)
    assert calls == ["oban", "oban-distillery"]
    with Session(engine) as session:
        state = session.get(RetailMatchState, bid)
        assert state.status == "matched"
        assert session.get(RetailPriceLink, bid).product_url == candidate["product_url"]
        assert session.get(Bottle, bid).release_year == 2025


def test_catalog_failure_reports_page_and_http_status(monkeypatch, caplog):
    import httpx
    import pytest
    from app.services import retail_matching as matching
    from app.services import retail_prices as prices

    monkeypatch.setattr(matching, "_catalog_failure_at", {})
    monkeypatch.setattr(matching.time, "sleep", lambda seconds: None)
    original = httpx.Client
    monkeypatch.setattr(matching.httpx, "Client", lambda **kwargs: original(
        transport=httpx.MockTransport(lambda request: httpx.Response(503)), **kwargs))
    with Session(engine) as session:
        with pytest.raises(prices.RetailPriceError, match=r"page 1: HTTP 503"):
            matching.catalog_candidates(session, "00088076179806", collection="failure-test")
    assert "scope=lovescotch:failure-test" in caplog.text
    assert "page=1" in caplog.text and "HTTP 503" in caplog.text


def test_title_year_selection():
    from app.models import Bottle
    from app.services.retail_matching import select_release_candidates, review_reason
    bottle = Bottle(brand="Woodford Reserve", release_year=2025)
    plain = {"title": "Woodford Reserve Barrel Strength Rye", "variant_title": "Default Title", "tags": ["2024"]}
    old = {**plain, "title": plain["title"] + " 2024 Release"}
    wanted = {**plain, "title": plain["title"] + " 2025 Release"}
    assert select_release_candidates(bottle, [plain]) == ([plain], None)
    assert review_reason(bottle, plain) is None
    assert select_release_candidates(bottle, [old, wanted, plain]) == ([wanted], None)
    assert select_release_candidates(bottle, [old, plain]) == ([plain], None)
    found, error = select_release_candidates(bottle, [old])
    assert found == [] and "2024" in error and "2025" in error
    bottle.release_year = None
    bottle.expression = "Barrel Strength Rye 2025 Release"
    assert select_release_candidates(bottle, [old, wanted]) == ([wanted], None)
    bottle.expression = "Barrel Strength Rye"
    assert select_release_candidates(bottle, [old]) == ([old], None)


def test_admin_batch_refresh_selection_progress_and_failures(monkeypatch, tmp_path):
    from datetime import timedelta
    from sqlmodel import SQLModel, create_engine
    from app.db import get_session
    from app.models import Bottle, RetailPriceLink, RetailPriceObservation, RetailPriceBatch
    from app.services import retail_batch as batch_service, retail_prices as prices

    test_engine = create_engine(f"sqlite:///{tmp_path / 'batch.db'}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(test_engine)
    def sessions():
        with Session(test_engine) as session:
            yield session
    app.dependency_overrides[get_session] = sessions
    monkeypatch.setattr(db_module, "engine", test_engine)
    now = datetime(2026, 9, 27, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(prices, "utcnow", lambda: now)
    try:
        with Session(test_engine) as session:
            for username, role in [("root", "admin"), ("viewer", "user")]:
                session.add(User(username=username, role=role, password_hash=hash_password("AdminPass123!")))
            for bid, upc in [(1, "111111111111"), (2, "222222222222"), (3, "333333333333"),
                             (4, "444444444444"), (5, None), (6, "666666666666")]:
                session.add(Bottle(bottle_id=bid, brand=f"Bottle {bid}", barcode_upc=upc))
            for bid, age in [(1, 8), (2, 7), (3, 2)]:
                session.add(RetailPriceLink(bottle_id=bid, product_url="https://lovescotch.com/products/test", variant_id="123", product_title="Test"))
                session.add(RetailPriceObservation(bottle_id=bid, product_url="https://lovescotch.com/products/test", variant_id="123",
                                                   product_title="Test", price_cents=9000, available=True, checked_at=now - timedelta(days=age)))
            session.add(MarketPrice(barcode_upc="666666666666", price=80, as_of=now - timedelta(days=1)))
            session.commit()
        guest = TestClient(app)
        assert guest.get("/admin/price-setup").status_code == 403
        assert guest.post("/admin/price-setup/batch", json={}).status_code == 403
        login(guest, username="viewer")
        assert guest.get("/admin/price-setup").status_code == 403
        assert guest.post("/admin/price-setup/batch", json={}).status_code == 403
        client = TestClient(app)
        login(client)
        setup = client.get("/admin/price-setup").json()
        assert setup["eligible"] == 3 and setup["missing_identifier"] == 1
        assert client.post("/admin/price-setup/batch", json={"source": "unknown"}).status_code == 422
        calls = []
        def match(bid):
            calls.append(bid)
            if bid == 2:
                raise RuntimeError("Provider offline")
            with Session(test_engine) as session:
                bottle = session.get(Bottle, bid)
                link = session.get(RetailPriceLink, bid) or RetailPriceLink(
                    bottle_id=bid, product_url="https://lovescotch.com/products/test", variant_id="123", product_title="Test")
                product = _retail_product()
                product["variants"][0]["barcode"] = bottle.barcode_upc
                prices.record_quote(session, link, product)
        monkeypatch.setattr(batch_service, "match_bottle", match)
        response = client.post("/admin/price-setup/batch", json={"source": "lovescotch"})
        assert response.status_code == 202, response.text
        assert response.json()["total"] == 3
        assert calls == [1, 2, 4]
        result = client.get("/admin/price-setup").json()
        assert result["eligible"] == 1
        batch = result["batch"]
        assert batch["status"] == "completed"
        assert batch["completed"] == 3 and batch["updated"] == 2 and batch["failed"] == 1
        assert batch["results"][1]["status"] == "error"
        with Session(test_engine) as session:
            assert session.get(RetailPriceBatch, batch["batch_id"]).finished_at is not None
        # Repeated clicks cannot queue duplicate batches, and restart recovery unblocks one.
        monkeypatch.setattr(batch_service, "run_batch", lambda bid: None)
        assert client.post("/admin/price-setup/batch", json={}).status_code == 202
        assert client.post("/admin/price-setup/batch", json={}).status_code == 409
        batch_service.interrupt_unfinished_batches()
        assert client.get("/admin/price-setup").json()["batch"]["status"] == "interrupted"
        assert client.post("/admin/price-setup/batch", json={}).status_code == 202
    finally:
        app.dependency_overrides.pop(get_session, None)
        test_engine.dispose()
